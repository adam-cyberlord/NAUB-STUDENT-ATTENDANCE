'use strict';

// Supabase-backed data layer for signed-in production accounts. Maps database rows
// into the shapes js/app.js renders and wraps the authenticated RPCs.
(function () {
  const TOKEN_CACHE_KEY = 'naub-session-qr-tokens';
  const TINTS = ['purple', 'blue', 'amber'];

  const client = () => window.NaubAuth.client();
  const pad = value => String(value).padStart(2, '0');
  const localDate = value => { const d = new Date(value); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const localTime = value => { const d = new Date(value); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  function readTokens() {
    try { return JSON.parse(sessionStorage.getItem(TOKEN_CACHE_KEY)) || {}; } catch (_) { return {}; }
  }
  function rememberToken(sessionId, token) {
    if (!sessionId || !token) return;
    const tokens = readTokens();
    tokens[sessionId] = token;
    sessionStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(tokens));
  }

  async function rows(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function rpc(name, args) {
    const supabase = await client();
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw new Error(error.message || 'request_failed');
    return data;
  }

  async function load(account) {
    const supabase = await client();
    const [courses, enrollments, users, sessions, attendance, schedules, venues, notifications, lecturerAttendance] = await Promise.all([
      rows(supabase.from('courses').select('id, course_code, title, department, semester, lecturer_id').order('course_code')),
      rows(supabase.from('enrollments').select('course_id, student_id, status').eq('status', 'active')),
      rows(supabase.from('users').select('id, full_name, matric_number, staff_id, email, account_status, created_at')),
      rows(supabase.from('sessions').select('id, course_id, created_by, starts_at, ends_at, location_name, latitude, longitude, radius_metres, status, closed_at, schedule_id').order('starts_at', { ascending: false }).limit(500)),
      rows(supabase.from('attendance').select('id, session_id, course_id, student_id, status, checked_at, matric_number').limit(5000)),
      rows(supabase.from('class_schedules').select('id, course_id, lecturer_id, class_date, starts_at, ends_at, venue, venue_id, instructions, status, attendance_session_id, updated_at').order('starts_at')).catch(() => []),
      rows(supabase.from('venues').select('*').order('name')).catch(() => []),
      rows(supabase.from('notifications').select('id, user_id, title, body, created_at').order('created_at', { ascending: false }).limit(50)),
      rows(supabase.from('lecturer_attendance').select('id, lecturer_id, schedule_id, status, checked_in_at')).catch(() => []),
    ]);

    const userById = new Map(users.map(user => [user.id, user]));
    const sessionsByCourse = new Map();
    sessions.forEach(session => {
      if (session.course_id && Date.parse(session.starts_at) <= Date.now()) {
        sessionsByCourse.set(session.course_id, (sessionsByCourse.get(session.course_id) || 0) + 1);
      }
    });
    const rate = (attended, held) => (held ? Math.round((attended / held) * 100) : 100);

    const studentMap = new Map();
    enrollments.forEach(enrollment => {
      const user = userById.get(enrollment.student_id);
      if (!studentMap.has(enrollment.student_id)) {
        studentMap.set(enrollment.student_id, {
          id: enrollment.student_id,
          name: user?.full_name || 'Student',
          matric: user?.matric_number || '',
          courseIds: [],
          attended: 0,
          held: 0,
          rate: 100,
        });
      }
      studentMap.get(enrollment.student_id).courseIds.push(enrollment.course_id);
    });
    if (account.role === 'student' && !studentMap.has(account.userId)) {
      studentMap.set(account.userId, { id: account.userId, name: account.name, matric: account.matricNumber || '', courseIds: [], attended: 0, held: 0, rate: 100 });
    }
    const students = [...studentMap.values()];
    students.forEach(student => {
      student.held = student.courseIds.reduce((sum, courseId) => sum + (sessionsByCourse.get(courseId) || 0), 0);
      student.attended = attendance.filter(record => record.student_id === student.id && record.status !== 'absent').length;
      student.rate = rate(student.attended, student.held);
    });

    const mappedCourses = courses.map((course, index) => {
      const enrolled = students.filter(student => student.courseIds.includes(course.id));
      const held = sessionsByCourse.get(course.id) || 0;
      const attended = attendance.filter(record => record.course_id === course.id && record.status !== 'absent').length;
      return {
        id: course.id,
        code: course.course_code,
        name: course.title,
        department: course.department,
        lecturerId: course.lecturer_id,
        students: enrolled.length,
        rate: rate(attended, held * enrolled.length),
        tint: TINTS[index % TINTS.length],
        room: '',
      };
    });

    const tokens = readTokens();
    return {
      courses: mappedCourses,
      students,
      sessions: sessions.map(session => ({
        id: session.id,
        courseId: session.course_id,
        scheduleId: session.schedule_id,
        date: localDate(session.starts_at),
        startAt: session.starts_at,
        endAt: session.ends_at,
        location: session.location_name,
        latitude: session.latitude,
        longitude: session.longitude,
        radius: session.radius_metres,
        status: session.status,
        closedAt: session.closed_at,
        token: tokens[session.id] || '',
        topic: 'Regular lecture',
      })),
      attendance: attendance.map(record => ({
        id: record.id,
        sessionId: record.session_id,
        courseId: record.course_id,
        studentId: record.student_id,
        matricNumber: record.matric_number,
        status: String(record.status || '').toUpperCase(),
        checkedAt: record.checked_at,
      })),
      schedules: schedules.map(schedule => ({
        id: schedule.id,
        courseId: schedule.course_id,
        lecturerId: schedule.lecturer_id,
        lecturerName: userById.get(schedule.lecturer_id)?.full_name || 'Lecturer',
        date: schedule.class_date,
        startTime: localTime(schedule.starts_at),
        endTime: localTime(schedule.ends_at),
        venueId: schedule.venue_id || '',
        venue: schedule.venue,
        instructions: schedule.instructions || '',
        status: schedule.status === 'rescheduled' ? 'scheduled' : schedule.status,
        wasRescheduled: schedule.status === 'rescheduled',
        attendanceSessionId: schedule.attendance_session_id,
        updatedAt: schedule.updated_at,
      })),
      venues: venues.map(venue => ({
        id: venue.id,
        name: venue.name,
        faculty: venue.faculty,
        department: venue.department || '',
        campus: venue.campus,
        building: venue.building || '',
        floor: venue.floor_location || '',
        type: venue.venue_type,
        capacity: venue.capacity,
        status: venue.status,
        bufferMinutes: venue.buffer_minutes,
      })),
      pendingAccounts: users.filter(user => user.account_status === 'pending').map(user => ({
        id: user.id, name: user.full_name, matric: user.matric_number, staffId: user.staff_id, email: user.email, createdAt: user.created_at,
      })),
      notifications: notifications.map(item => ({ id: item.id, studentId: item.user_id, title: item.title, body: item.body, createdAt: item.created_at })),
      lecturerAttendance: lecturerAttendance.map(item => ({ id: item.id, lecturerId: item.lecturer_id, scheduleId: item.schedule_id, status: item.status, checkedInAt: item.checked_in_at })),
    };
  }

  function firstRow(data) {
    return Array.isArray(data) ? data[0] : data;
  }

  window.NaubData = {
    load,
    rememberToken,
    async createSession(details) {
      const row = firstRow(await rpc('create_class_session', {
        p_course_id: details.courseId,
        p_starts_at: details.startAt,
        p_ends_at: details.endAt,
        p_location_name: details.location,
        p_latitude: details.latitude,
        p_longitude: details.longitude,
        p_radius_metres: details.radius,
        p_late_after_minutes: 15,
      }));
      rememberToken(row?.session_id, row?.qr_token);
      return row?.session_id;
    },
    updateSession: (sessionId, details) => rpc('update_class_session', {
      p_session_id: sessionId,
      p_starts_at: details.startAt,
      p_ends_at: details.endAt,
      p_location_name: details.location,
      p_latitude: details.latitude,
      p_longitude: details.longitude,
      p_radius_metres: details.radius,
      p_late_after_minutes: 15,
    }),
    async rotateQr(sessionId) {
      const token = await rpc('rotate_session_qr', { p_session_id: sessionId });
      rememberToken(sessionId, token);
      return token;
    },
    setAccountStatus: (userId, status) => rpc('admin_set_account_status', { p_user_id: userId, p_status: status, p_reason: null }),
    closeSession: sessionId => rpc('close_class_session', { p_session_id: sessionId }),
    markAttendance: (token, deviceId, position) => rpc('mark_attendance', {
      p_qr_token: token,
      p_device_identifier: deviceId,
      p_latitude: position.latitude,
      p_longitude: position.longitude,
      p_accuracy_metres: position.accuracy,
    }),
    publishSchedule: details => rpc('publish_class_schedule', {
      p_course_id: details.courseId,
      p_class_date: details.date,
      p_starts_at: new Date(`${details.date}T${details.startTime}`).toISOString(),
      p_ends_at: new Date(`${details.date}T${details.endTime}`).toISOString(),
      p_venue_id: details.venueId,
      p_instructions: details.instructions || '',
    }),
    updateSchedule: (scheduleId, details) => rpc('update_class_schedule', {
      p_schedule_id: scheduleId,
      p_class_date: details.date,
      p_starts_at: new Date(`${details.date}T${details.startTime}`).toISOString(),
      p_ends_at: new Date(`${details.date}T${details.endTime}`).toISOString(),
      p_venue_id: details.venueId,
      p_instructions: details.instructions || '',
    }),
    cancelSchedule: scheduleId => rpc('cancel_class_schedule', { p_schedule_id: scheduleId }),
    async startScheduledAttendance(scheduleId, position) {
      const row = firstRow(await rpc('start_scheduled_attendance', {
        p_schedule_id: scheduleId,
        p_latitude: position.latitude,
        p_longitude: position.longitude,
        p_radius_metres: 50,
      }));
      rememberToken(row?.session_id, row?.qr_token);
      return row?.session_id;
    },
    saveVenue: (venueId, venue) => rpc('manage_venue', {
      p_venue_id: venueId,
      p_name: venue.name,
      p_faculty: venue.faculty,
      p_department: venue.department,
      p_campus: venue.campus,
      p_building: venue.building,
      p_floor_location: venue.floor,
      p_venue_type: venue.type,
      p_capacity: venue.capacity,
      p_status: venue.status,
      p_buffer_minutes: venue.bufferMinutes,
      p_unavailable_reason: null,
    }),
  };
})();
