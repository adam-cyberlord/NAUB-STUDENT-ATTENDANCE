'use strict';

const STORAGE_KEY = 'naub-attendance-demo-v1';
const THRESHOLD = 75;
const MAX_GPS_ACCURACY_METRES = 100;
const svgIcon = (name, className = 'inline-icon') => `<svg class="${className}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
const DEMO_ACCOUNTS = {
  student: { role: 'student', matricNumber: '190401001', password: 'StudentDemo26!', name: 'Chiamaka Okafor' },
  lecturer: { role: 'lecturer', username: 'lecturer.demo', password: 'DemoLecturer26!', name: 'Dr. Amina Yusuf' },
  admin: { role: 'admin', username: 'admin.demo', password: 'DemoAdmin26!', name: 'NAUB Administrator' },
};
const CONTACTS = {
  lecturer: { id: 'lecturer-amina', role: 'Lecturer', name: 'Dr. Amina Yusuf', phone: '+2348012345601', email: 'amina.yusuf@naub.edu.ng', detail: 'Computer Science · CSC 301' },
  admin: { id: 'admin-support', role: 'Admin', name: 'NAUB Attendance Admin', phone: '+2348012345602', email: 'attendance.admin@naub.edu.ng', detail: 'Attendance support desk' },
};
const COURSES = [
  { id: 'csc301', code: 'CSC 301', name: 'Data Structures & Algorithms', students: 48, rate: 87, tint: 'purple', room: 'Main Lecture Theatre' },
  { id: 'csc305', code: 'CSC 305', name: 'Database Management Systems', students: 36, rate: 76, tint: 'blue', room: 'Computer Science Lab' },
  { id: 'csc311', code: 'CSC 311', name: 'Operating Systems', students: 28, rate: 91, tint: 'amber', room: 'Lecture Hall B' },
  { id: 'gst201', code: 'GST 201', name: 'Entrepreneurship Studies', students: 16, rate: 68, tint: 'purple', room: 'Main Classroom' },
];
const DEFAULT_VENUES = [
  { id: 'venue-computing-1', name: 'Lecture Hall 1', faculty: 'Faculty of Computing', department: 'Computer Science', campus: 'Main Campus', building: 'Computing Building', floor: 'Ground floor', type: 'Lecture Hall', capacity: 120, status: 'available', bufferMinutes: 0 },
  { id: 'venue-engineering-1', name: 'Lecture Hall 1', faculty: 'Faculty of Engineering', department: 'Electrical Engineering', campus: 'Main Campus', building: 'Engineering Block', floor: 'Ground floor', type: 'Lecture Hall', capacity: 200, status: 'available', bufferMinutes: 0 },
  { id: 'venue-cs-lab', name: 'Computer Science Lab', faculty: 'Faculty of Computing', department: 'Computer Science', campus: 'Main Campus', building: 'Computing Building', floor: 'First floor', type: 'Laboratory', capacity: 60, status: 'available', bufferMinutes: 0 },
  { id: 'venue-hall-b', name: 'Lecture Hall B', faculty: 'Faculty of Computing', department: 'Computer Science', campus: 'Biu Campus', building: 'Main Lecture Block', floor: 'First floor', type: 'Lecture Hall', capacity: 100, status: 'available', bufferMinutes: 0 },
];
const STUDENTS = [
  { id: 'u1', name: 'Chiamaka Okafor', matric: '190401001', courseIds: ['csc301', 'csc305'], rate: 92, attended: 11 },
  { id: 'u2', name: 'Ibrahim Musa', matric: '190401018', courseIds: ['csc301', 'csc311'], rate: 84, attended: 10 },
  { id: 'u3', name: 'Temitope Adebayo', matric: '190401023', courseIds: ['csc301', 'csc305'], rate: 72, attended: 8 },
  { id: 'u4', name: 'Adaeze Nwosu', matric: '190401037', courseIds: ['csc301', 'gst201'], rate: 96, attended: 12 },
  { id: 'u5', name: 'Yusuf Bello', matric: '190401052', courseIds: ['csc305', 'csc311'], rate: 67, attended: 8 },
  { id: 'u6', name: 'Fatima Suleiman', matric: '190401064', courseIds: ['csc301', 'csc311'], rate: 88, attended: 11 },
  { id: 'u7', name: 'Emeka Eze', matric: '190401079', courseIds: ['csc305', 'gst201'], rate: 73, attended: 9 },
  { id: 'u8', name: 'Kemi Balogun', matric: '190401086', courseIds: ['csc301', 'csc305'], rate: 81, attended: 10 },
  { id: 'u9', name: 'Sani Abubakar', matric: '190401091', courseIds: ['csc301', 'csc311'], rate: 58, attended: 7 },
  { id: 'u10', name: 'Nneka Okoye', matric: '190401104', courseIds: ['csc301', 'gst201'], rate: 94, attended: 12 },
  { id: 'u11', name: 'Tunde Oladipo', matric: '190401117', courseIds: ['csc305', 'csc311'], rate: 69, attended: 8 },
  { id: 'u12', name: 'Zainab Garba', matric: '190401126', courseIds: ['csc301', 'csc305'], rate: 79, attended: 9 },
];

let state;
let supabaseClientPromise = null;
let isAuthenticated = false;
let activeSessionId = null;
let editingSessionId = null;
let sessionFilter = 'all';
let currentDemoAccount = null;
let toastTimer;
const adminBookingFilters = { date: '', venueId: '', faculty: '', lecturer: '' };
const AUTH_SESSION_KEY = 'naub-attendance-auth-v1';
const PENDING_SCAN_KEY = 'naub-pending-scan-token';

document.addEventListener('DOMContentLoaded', init);

function normalizeMatric(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

async function enforceAuthenticationGate() {
  if (window.NaubAuth?.enabled()) {
    try {
      const account = await window.NaubAuth.restore();
      if (account) {
        enterDemoDashboard(account, false);
        return;
      }
    } catch (error) {
      console.warn('Unable to restore the Supabase session:', error);
    }
    document.body.classList.add('auth-required');
    openStudentPortal();
    return;
  }
  let savedAccount = null;
  try {
    savedAccount = JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY));
  } catch (_) {
    savedAccount = null;
  }
  if (!savedAccount || !['student', 'lecturer', 'admin'].includes(savedAccount.role)) {
    currentDemoAccount = null;
    document.body.classList.add('auth-required');
    openStudentPortal();
    return;
  }
  currentDemoAccount = savedAccount;
  document.body.classList.remove('auth-required');
  enterDemoDashboard(savedAccount, false);
}

async function init() {
  state = loadState();
  seedState();
  bindNavigation();
  bindSessionForm();
  bindScheduleManagement();
  bindVenueManagement();
  bindScanFlow();
  bindExports();
  bindTheme();
  bindUtilityControls();
  bindRoleSwitcher();
  bindStudentAuth();
  bindDeviceManagement();
  populateCourseSelects();
  renderAll();
  renderWorkflowPages();
  setTodayLabel();
  setSessionDefaults();
  bindMobileApp();
  await enforceAuthenticationGate();
  openRouteSession();
  ensureStudentAuthentication();
}

async function getSupabase() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = fetch('/api/auth-config')
      .then(response => {
        if (!response.ok) throw new Error('Authentication configuration is unavailable.');
        return response.json();
      })
      .then(config => import('https://esm.sh/@supabase/supabase-js@2').then(({ createClient }) => {
        if (!config.url || !config.publishableKey) throw new Error('Supabase authentication is not configured.');
        return createClient(config.url, config.publishableKey);
      }));
  }
  return supabaseClientPromise;
}

async function ensureStudentAuthentication() {
  if (!window.NaubAuth?.enabled()) return;
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    isAuthenticated = Boolean(data.session);
  } catch (error) {
    console.error('Unable to initialize student authentication:', error);
  }
  if (!isAuthenticated && !currentDemoAccount) openStudentPortal();
}

function matricEmail(matric) {
  return `${matric.trim().toLowerCase().replace(/[^a-z0-9]/g, '')}@students.naub.edu.ng`;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { sessions: [], attendance: [], schedules: [], scheduleHistory: [], notifications: [], venues: [], venueHistory: [], lecturerAttendance: [], messages: [] };
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.attendance)) {
      throw new Error('Stored demo data has an unexpected shape.');
    }
    parsed.schedules = Array.isArray(parsed.schedules) ? parsed.schedules : [];
    parsed.scheduleHistory = Array.isArray(parsed.scheduleHistory) ? parsed.scheduleHistory : [];
    parsed.notifications = Array.isArray(parsed.notifications) ? parsed.notifications : [];
    parsed.venues = Array.isArray(parsed.venues) ? parsed.venues : [];
    parsed.venueHistory = Array.isArray(parsed.venueHistory) ? parsed.venueHistory : [];
    parsed.lecturerAttendance = Array.isArray(parsed.lecturerAttendance) ? parsed.lecturerAttendance : [];
    parsed.messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    return parsed;
  } catch (error) {
    console.error('Unable to load NAUB attendance demo data:', error);
    return { sessions: [], attendance: [], schedules: [], scheduleHistory: [], notifications: [], venues: [], venueHistory: [], lecturerAttendance: [], messages: [] };
  }
}

function isProduction() {
  return Boolean(currentDemoAccount?.production && window.NaubData);
}

let remoteLoad = null;
async function refreshRemoteData() {
  if (!isProduction()) return;
  if (remoteLoad) return remoteLoad;
  remoteLoad = (async () => {
    try {
      const data = await window.NaubData.load(currentDemoAccount);
      COURSES.splice(0, COURSES.length, ...data.courses);
      STUDENTS.splice(0, STUDENTS.length, ...data.students);
      state = {
        sessions: data.sessions, attendance: data.attendance, schedules: data.schedules, scheduleHistory: [],
        notifications: data.notifications, venues: data.venues, venueHistory: [], lecturerAttendance: data.lecturerAttendance, messages: [],
      };
      renderAll();
      renderLecturerSchedules();
      if (currentDemoAccount && currentDemoAccount.role !== 'lecturer') renderRoleDashboard(currentDemoAccount);
    } catch (error) {
      console.error('Unable to load attendance data from Supabase:', error);
      showToast('Could not load the latest data from the server.', 'error');
    } finally {
      remoteLoad = null;
    }
  })();
  return remoteLoad;
}

async function runRemote(action, successMessage) {
  try {
    const result = await action();
    await refreshRemoteData();
    if (successMessage) showToast(successMessage);
    return result;
  } catch (error) {
    console.error('Server request failed:', error);
    showToast(error.message || 'The server rejected this request.', 'error');
    return undefined;
  }
}

function persist() {
  if (isProduction()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Unable to save NAUB attendance demo data:', error);
    showToast('Could not save this change in your browser. Check available storage.', 'error');
  }
}

function seedState() {
  const now = new Date();
  let changed = false;
  if (!state.venues.length) {
    state.venues = DEFAULT_VENUES.map(venue => ({ ...venue }));
    changed = true;
  }
  if (!state.sessions.length) {
    const activeStart = new Date(now.getTime() - 15 * 60_000);
    const activeEnd = new Date(now.getTime() + 45 * 60_000);
    state.sessions = [
      makeSeedSession('csc301', activeStart, activeEnd, 'NAUB Main Campus, Biu'),
      makeSeedSession('csc305', atTime(now, 13, 30), atTime(now, 14, 30), 'Computer Science Lab'),
      makeSeedSession('csc311', atTime(now, 9, 0), atTime(now, 10, 0), 'Lecture Hall B'),
    ];
    changed = true;
  }
  if (!state.schedules.length) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    state.schedules = [{
      id: randomId(), courseId: 'csc301', date: localDate(tomorrow), startTime: '09:00', endTime: '10:30',
      venueId: 'venue-computing-1', venue: 'Faculty of Computing — Lecture Hall 1 — Main Campus', instructions: 'Bring your Data Structures notebook.', status: 'scheduled',
      lecturerName: 'Dr. Amina Yusuf', updatedAt: now.toISOString(), wasRescheduled: false
    }];
    changed = true;
  }
  if (changed) persist();
}

function makeSeedSession(courseId, start, end, location) {
  return {
    id: randomId(),
    courseId,
    date: localDate(start),
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    location,
    latitude: 10.61,
    longitude: 12.19,
    radius: 50,
    token: randomId() + randomId(),
    qrIssuedAt: new Date().toISOString(),
    topic: 'Regular lecture',
    expiresIn: QR_ROTATION_SECONDS,
    status: 'open',
    demo: true,
  };
}

let deferredInstallPrompt = null;

function bindMobileApp() {
  const installButtons = [...document.querySelectorAll('[data-install-app]')];
  const setInstallButtonsVisible = visible => installButtons.forEach(button => button.classList.toggle('hidden', !visible));
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    setInstallButtonsVisible(true);
  });
  installButtons.forEach(installButton => installButton.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    installButton.disabled = true;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    setInstallButtonsVisible(false);
    installButton.disabled = false;
  }));
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    setInstallButtonsVisible(false);
    showToast('NAUB Attendance installed on this device.');
  });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(error => {
        console.warn('Unable to register the mobile app service worker:', error);
      });
    });
  }
}

function randomId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID().replaceAll('-', '');
  if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
    throw new Error('Secure browser randomness is required to create a session token.');
  }
  const values = new Uint8Array(16);
  window.crypto.getRandomValues(values);
  return [...values].map(value => value.toString(16).padStart(2, '0')).join('');
}

function atTime(date, hours, minutes) {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => navigateTo(button.dataset.page));
  });
  document.querySelectorAll('[data-navigate]').forEach(button => {
    button.addEventListener('click', () => navigateTo(button.dataset.navigate));
  });
  document.getElementById('mobileMenu').addEventListener('click', () => {
    toggleMobileMenu();
  });
  document.getElementById('sidebarBackdrop').addEventListener('click', closeMobileMenu);
  document.getElementById('createSessionBtn').addEventListener('click', () => openSessionForm());
  document.getElementById('createSessionBtn2').addEventListener('click', () => openSessionForm());
  document.getElementById('studentPortalBtn').addEventListener('click', () => {
    if (currentDemoAccount) {
      demoSignOut();
      return;
    }
    openStudentPortal();
  });
  document.getElementById('roleDashboardContent').addEventListener('click', event => {
    const action = event.target.closest('[data-admin-view]');
    if (action && currentDemoAccount && currentDemoAccount.role === 'admin') {
      navigateTo(action.dataset.adminView);
    }
    const editVenue = event.target.closest('[data-edit-venue]');
    const newVenue = event.target.closest('[data-new-venue]');
    const toggleVenueButton = event.target.closest('[data-toggle-venue]');
    if (currentDemoAccount?.role === 'admin' && editVenue) openVenueForm(editVenue.dataset.editVenue);
    if (currentDemoAccount?.role === 'admin' && newVenue) openVenueForm();
    if (currentDemoAccount?.role === 'admin' && toggleVenueButton) toggleVenue(toggleVenueButton.dataset.toggleVenue);
  });
  document.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => closeModal(button.dataset.close));
  });
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) closeModal(backdrop.id);
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(modal => closeModal(modal.id));
  });
  document.querySelectorAll('.session-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      sessionFilter = tab.dataset.filter;
      document.querySelectorAll('.session-tab').forEach(item => item.classList.toggle('active', item === tab));
      renderSessions();
    });
  });
}

function toggleMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const open = sidebar.classList.toggle('mobile-open');
  document.getElementById('sidebarBackdrop').classList.toggle('visible', open);
  document.body.classList.toggle('menu-open', open);
  document.getElementById('mobileMenu').setAttribute('aria-expanded', String(open));
}

function closeMobileMenu() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarBackdrop').classList.remove('visible');
  document.body.classList.remove('menu-open');
  document.getElementById('mobileMenu').setAttribute('aria-expanded', 'false');
}

let editingScheduleId = null;
let editingVenueId = null;

function venueById(id) {
  return state.venues.find(venue => venue.id === id);
}

function venueLabel(venue) {
  if (!venue) return 'Venue not selected';
  return `${venue.faculty} — ${venue.name} — ${venue.campus || venue.building || 'Campus'}`;
}

function scheduleInterval(schedule) {
  return {
    start: Date.parse(`${schedule.date}T${schedule.startTime}:00`),
    end: Date.parse(`${schedule.date}T${schedule.endTime}:00`),
  };
}

function venueHasConflict(venueId, date, startTime, endTime, ignoreScheduleId = null) {
  const candidate = { date, startTime, endTime };
  const range = scheduleInterval(candidate);
  const venue = venueById(venueId);
  const buffer = Number(venue?.bufferMinutes || 0) * 60 * 1000;
  return state.schedules.some(schedule => {
    if (schedule.id === ignoreScheduleId || schedule.status === 'cancelled' || schedule.venueId !== venueId) return false;
    const existing = scheduleInterval(schedule);
    return existing.start < range.end + buffer && range.start < existing.end + buffer;
  });
}

function availableVenues(date, startTime, endTime, ignoreScheduleId = null) {
  if (!date || !startTime || !endTime || endTime <= startTime) return [];
  return state.venues.filter(venue => venue.status === 'available'
    && venue.capacity >= 1
    && !venueHasConflict(venue.id, date, startTime, endTime, ignoreScheduleId));
}

function formatVenueDetails(venue) {
  if (!venue) return 'Venue details unavailable';
  return `${venueLabel(venue)} · ${venue.building || 'Building not specified'} · ${venue.type} · ${venue.capacity} seats`;
}

function scheduleStatus(schedule) {
  if (schedule.status === 'cancelled') return 'Cancelled';
  const end = new Date(`${schedule.date}T${schedule.endTime || '23:59'}`);
  if (end.getTime() < Date.now()) return 'Completed';
  return schedule.wasRescheduled ? 'Rescheduled' : 'Scheduled';
}

function scheduleDateTime(schedule, time) {
  return new Date(`${schedule.date}T${time}:00`).toISOString();
}

function notifyEnrolledStudents(schedule, action, previous = null) {
  const course = courseById(schedule.courseId);
  const students = STUDENTS.filter(student => student.courseIds.includes(schedule.courseId));
  students.forEach(student => {
    const eventKey = `${schedule.id}:${action}:${schedule.updatedAt}`;
    if (state.notifications.some(item => item.studentId === student.id && item.eventKey === eventKey)) return;
    const title = action === 'cancelled' ? `${course.code} class cancelled`
      : action === 'rescheduled' ? `${course.code} class rescheduled`
      : action === 'venue_changed' ? `${course.code} venue changed`
      : `${course.code} class published`;
    let body = `${schedule.date} · ${schedule.startTime}-${schedule.endTime} · ${schedule.venue}`;
    if ((action === 'rescheduled' || action === 'venue_changed') && previous) {
      body = `Previous: ${previous.date} · ${previous.startTime}-${previous.endTime} · ${previous.venue}. Now: ${body}`;
    }
    state.notifications.push({ id: randomId(), studentId: student.id, scheduleId: schedule.id, eventKey, title, body, action, read: false, createdAt: new Date().toISOString() });
  });
}

function bindScheduleManagement() {
  ['scheduleDate', 'scheduleStart', 'scheduleEnd', 'scheduleVenueFaculty'].forEach(id => {
    document.getElementById(id).addEventListener('change', refreshVenueOptions);
  });
  document.getElementById('scheduleForm').addEventListener('submit', event => {
    event.preventDefault();
    const courseId = document.getElementById('scheduleCourse').value;
    const venue = venueById(document.getElementById('scheduleVenue').value);
    const schedule = {
      id: editingScheduleId || randomId(), courseId, date: document.getElementById('scheduleDate').value,
      startTime: document.getElementById('scheduleStart').value, endTime: document.getElementById('scheduleEnd').value,
      venueId: venue?.id || '', venue: venue ? venueLabel(venue) : '', instructions: document.getElementById('scheduleInstructions').value.trim(),
      lecturerName: currentDemoAccount?.name || 'Dr. Amina Yusuf', status: 'scheduled', updatedAt: new Date().toISOString(), wasRescheduled: false
    };
    const course = courseById(courseId);
    if (schedule.endTime <= schedule.startTime) {
      document.getElementById('scheduleError').textContent = 'End time must be later than start time.';
      document.getElementById('scheduleError').classList.remove('hidden');
      return;
    }
    if (!venue || venue.status !== 'available') return scheduleError('Select an active venue.');
    if (venue.capacity < course.students) return scheduleError(`This venue seats ${venue.capacity}, but ${course.code} has ${course.students} enrolled students.`);
    if (venueHasConflict(venue.id, schedule.date, schedule.startTime, schedule.endTime, editingScheduleId)) {
      return scheduleError('That venue is already booked during this time. Choose another venue or time.');
    }
    if (isProduction()) {
      const scheduleId = editingScheduleId;
      runRemote(() => (scheduleId ? window.NaubData.updateSchedule(scheduleId, schedule) : window.NaubData.publishSchedule(schedule)),
        scheduleId ? 'Class schedule updated and published.' : 'Class schedule published.')
        .then(result => { if (result !== undefined) { closeModal('scheduleModal'); editingScheduleId = null; } });
      return;
    }
    const existingIndex = state.schedules.findIndex(item => item.id === schedule.id);
    if (existingIndex >= 0) {
      const previous = state.schedules[existingIndex];
      const dateChanged = previous.date !== schedule.date
        || previous.startTime !== schedule.startTime
        || previous.endTime !== schedule.endTime;
      const venueChanged = previous.venueId !== schedule.venueId;
      schedule.wasRescheduled = dateChanged;
      state.scheduleHistory.push({ scheduleId: schedule.id, previousDate: previous.date, previousStartTime: previous.startTime, previousEndTime: previous.endTime, previousVenue: previous.venue, changedAt: new Date().toISOString() });
      state.schedules[existingIndex] = schedule;
      if (dateChanged) notifyEnrolledStudents(schedule, 'rescheduled', previous);
      else if (venueChanged) notifyEnrolledStudents(schedule, 'venue_changed', previous);
      showToast('Class schedule updated and published.');
    } else {
      state.schedules.push(schedule);
      notifyEnrolledStudents(schedule, 'published');
      showToast('Class schedule published.');
    }
    persist(); renderAll(); renderLecturerSchedules(); if (currentDemoAccount) renderRoleDashboard(currentDemoAccount);
    closeModal('scheduleModal'); editingScheduleId = null;
  });
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY && !isProduction()) {
      state = loadState();
      renderAll();
      renderLecturerSchedules();
      if (currentDemoAccount) renderRoleDashboard(currentDemoAccount);
    }
  });
  window.setInterval(() => {
    if (isProduction()) { refreshRemoteData(); return; }
    if (currentDemoAccount?.production) return;
    const latest = loadState();
    if (JSON.stringify(latest) !== JSON.stringify(state)) { state = latest; renderAll(); renderLecturerSchedules(); if (currentDemoAccount) renderRoleDashboard(currentDemoAccount); }
  }, 30000);
}

function scheduleError(message) {
  const error = document.getElementById('scheduleError');
  error.textContent = message;
  error.classList.remove('hidden');
}

function refreshVenueOptions() {
  const select = document.getElementById('scheduleVenue');
  const faculty = document.getElementById('scheduleVenueFaculty').value;
  const course = courseById(document.getElementById('scheduleCourse').value);
  const venues = availableVenues(
    document.getElementById('scheduleDate').value,
    document.getElementById('scheduleStart').value,
    document.getElementById('scheduleEnd').value,
    editingScheduleId
  ).filter(venue => !faculty || venue.faculty === faculty);
  const previous = select.value;
  select.innerHTML = venues.length
    ? venues.map(venue => `<option value="${venue.id}">${escapeHtml(formatVenueDetails(venue))}</option>`).join('')
    : '<option value="">No active venues available for this time</option>';
  if (venues.some(venue => venue.id === previous)) select.value = previous;
  document.getElementById('scheduleVenueHint').textContent = venues.length
    ? `${venues.length} active venue${venues.length === 1 ? '' : 's'} available${course ? ` for ${course.code}` : ''}.`
    : 'No venues are available. Choose another date or time.';
}

function openScheduleForm(scheduleId = null) {
  editingScheduleId = scheduleId;
  const schedule = scheduleId ? state.schedules.find(item => item.id === scheduleId) : null;
  const courseSelect = document.getElementById('scheduleCourse');
  courseSelect.innerHTML = COURSES.map(course => `<option value="${course.id}">${escapeHtml(course.code)} · ${escapeHtml(course.name)}</option>`).join('');
  const facultySelect = document.getElementById('scheduleVenueFaculty');
  facultySelect.innerHTML = `<option value="">All faculties</option>${[...new Set(state.venues.map(venue => venue.faculty))].sort().map(faculty => `<option value="${escapeHtml(faculty)}">${escapeHtml(faculty)}</option>`).join('')}`;
  document.getElementById('scheduleModalTitle').textContent = schedule ? 'Reschedule class' : 'Publish a class';
  document.getElementById('scheduleDate').value = schedule?.date || new Date().toISOString().slice(0, 10);
  document.getElementById('scheduleStart').value = schedule?.startTime || '09:00';
  document.getElementById('scheduleEnd').value = schedule?.endTime || '10:00';
  document.getElementById('scheduleVenue').value = schedule?.venueId || '';
  document.getElementById('scheduleInstructions').value = schedule?.instructions || '';
  if (schedule) courseSelect.value = schedule.courseId;
  refreshVenueOptions();
  if (schedule?.venueId && [...document.getElementById('scheduleVenue').options].some(option => option.value === schedule.venueId)) {
    document.getElementById('scheduleVenue').value = schedule.venueId;
  }
  document.getElementById('scheduleError').classList.add('hidden');
  openModal('scheduleModal');
}

function renderLecturerSchedules() {
  const container = document.getElementById('lecturerScheduleManagement');
  if (!container) return;
  const schedules = [...state.schedules].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const today = localDate(new Date());
  const todaysSchedules = schedules.filter(schedule => schedule.date === today && schedule.status !== 'cancelled');
  const lecturerRecords = state.lecturerAttendance.filter(record => record.lecturerId === currentDemoAccount?.userId);
  const checkInSection = `<section class="schedule-management section-panel"><div class="panel-heading"><div><h2>My Attendance</h2><p>Check in for your own scheduled classes. This is separate from student attendance.</p></div></div><div class="schedule-list">${todaysSchedules.map(schedule => {
    const course = courseById(schedule.courseId);
    const record = lecturerRecords.find(item => item.scheduleId === schedule.id);
    return `<article class="schedule-card"><div class="schedule-details"><strong>${escapeHtml(course.code)} · ${escapeHtml(course.name)}</strong><p>${escapeHtml(schedule.startTime)}–${escapeHtml(schedule.endTime)} · ${escapeHtml(schedule.venue)}</p></div>${record ? `<span class="table-status">Checked in · ${escapeHtml(record.status)}</span>` : `<button class="button button-small button-primary" type="button" data-lecturer-checkin="${schedule.id}">Check in</button>`}</article>`;
  }).join('') || '<div class="empty-state"><strong>No classes scheduled today</strong>Your lecturer check-in options for today will appear here.</div>'}</div></section>`;
  container.innerHTML = `${checkInSection}<section class="schedule-management section-panel"><div class="panel-heading"><div><h2>Manage Class Attendance</h2><p>Create, reschedule, cancel, or start student attendance for your classes.</p></div><button class="button button-primary button-small" type="button" data-new-schedule>${svgIcon('plus')} Publish class</button></div><div class="schedule-list">${schedules.map(schedule => {
    const course = courseById(schedule.courseId);
    const status = scheduleStatus(schedule);
    const sessionExists = state.sessions.some(session => session.scheduleId === schedule.id && session.status !== 'closed');
    const venue = venueById(schedule.venueId);
    return `<article class="schedule-card"><div><span class="course-monogram ${escapeHtml(course.tint)}">${escapeHtml(course.code.split(' ').map(part => part[0]).join(''))}</span></div><div class="schedule-details"><strong>${escapeHtml(course.code)} · ${escapeHtml(course.name)}</strong><p>${escapeHtml(formatDate(schedule.date))} · ${escapeHtml(schedule.startTime)}–${escapeHtml(schedule.endTime)}</p><p>${escapeHtml(venue ? venueLabel(venue) : schedule.venue)}</p>${schedule.instructions ? `<small>${escapeHtml(schedule.instructions)}</small>` : ''}</div><span class="table-status schedule-status status-${status.toLowerCase()}">${status}</span><div class="schedule-actions"><button class="button button-small button-outline" type="button" data-edit-schedule="${schedule.id}" ${schedule.status === 'cancelled' || sessionExists ? 'disabled' : ''}>Reschedule</button><button class="button button-small button-outline" type="button" data-start-schedule="${schedule.id}" ${schedule.status === 'cancelled' || sessionExists ? 'disabled' : ''}>${sessionExists ? 'Session active' : 'Start attendance'}</button><button class="button button-small danger-outline" type="button" data-cancel-schedule="${schedule.id}" ${schedule.status === 'cancelled' || sessionExists ? 'disabled' : ''}>Cancel</button></div></article>`;
  }).join('') || '<div class="empty-state"><strong>No scheduled classes</strong>Publish a class for your students.</div>'}</div></section>`;
  container.querySelector('[data-new-schedule]').addEventListener('click', () => openScheduleForm());
  container.querySelectorAll('[data-lecturer-checkin]').forEach(button => button.addEventListener('click', () => checkInLecturerSchedule(button.dataset.lecturerCheckin)));
  container.querySelectorAll('[data-edit-schedule]').forEach(button => button.addEventListener('click', () => openScheduleForm(button.dataset.editSchedule)));
  container.querySelectorAll('[data-cancel-schedule]').forEach(button => button.addEventListener('click', () => cancelSchedule(button.dataset.cancelSchedule)));
  container.querySelectorAll('[data-start-schedule]').forEach(button => button.addEventListener('click', () => startScheduledAttendance(button.dataset.startSchedule)));
}

async function checkInLecturerSchedule(scheduleId) {
  const schedule = state.schedules.find(item => item.id === scheduleId);
  if (!schedule) return;
  if (window.NaubAuth?.enabled()) {
    try {
      const result = await window.NaubAuth.checkInLecturer(scheduleId);
      if (!result?.ok) {
        showToast(result?.reason === 'already_checked_in' ? 'You have already checked in for this class.' : 'Lecturer check-in was not accepted.', 'error');
        return;
      }
      showToast(`Lecturer check-in recorded as ${result.status}.`);
      await refreshRemoteData();
    } catch (error) {
      console.error('Lecturer check-in failed:', error);
      showToast('Lecturer check-in could not be completed.', 'error');
      return;
    }
  } else {
    const record = {
      id: randomId(), lecturerId: currentDemoAccount?.userId || currentDemoAccount?.name || 'demo-lecturer',
      scheduleId, status: 'on_time', checkedInAt: new Date().toISOString(), demo: true
    };
    if (state.lecturerAttendance.some(item => item.lecturerId === record.lecturerId && item.scheduleId === scheduleId)) {
      showToast('You have already checked in for this class.', 'error');
      return;
    }
    state.lecturerAttendance.push(record);
    persist();
    showToast('Lecturer check-in recorded in the browser demo.');
  }
  renderLecturerSchedules();
}

function cancelSchedule(scheduleId) {
  const schedule = state.schedules.find(item => item.id === scheduleId);
  if (!schedule || schedule.status === 'cancelled' || !window.confirm('Cancel this class? Enrolled students will be notified.')) return;
  if (isProduction()) { runRemote(() => window.NaubData.cancelSchedule(scheduleId), 'Class cancelled and students notified.'); return; }
  const previous = { ...schedule }; schedule.status = 'cancelled'; schedule.updatedAt = new Date().toISOString();
  state.sessions.filter(session => session.scheduleId === scheduleId && session.status === 'open').forEach(session => {
    session.status = 'closed';
    session.closedAt = schedule.updatedAt;
  });
  notifyEnrolledStudents(schedule, 'cancelled', previous); persist(); renderAll(); renderLecturerSchedules(); if (currentDemoAccount) renderRoleDashboard(currentDemoAccount); showToast('Class cancelled and students notified.');
}

function startScheduledAttendance(scheduleId) {
  const schedule = state.schedules.find(item => item.id === scheduleId);
  if (!schedule || schedule.status === 'cancelled') { showToast('Cancelled classes cannot start attendance.', 'error'); return; }
  if (isProduction()) {
    if (!navigator.geolocation) { showToast('Location is required to set the classroom check-in area.', 'error'); return; }
    showToast('Getting your location to set the classroom check-in area…');
    getCurrentPosition().catch(() => null).then(position => {
      if (!position) { showToast('Allow location access so students can be checked against this classroom.', 'error'); return undefined; }
      return runRemote(() => window.NaubData.startScheduledAttendance(scheduleId, position), 'Attendance session started for this scheduled class.');
    })
      .then(sessionId => { if (sessionId) { navigateTo('sessions'); openQrModal(sessionId); } });
    return;
  }
  const start = new Date(scheduleDateTime(schedule, schedule.startTime));
  const end = new Date(scheduleDateTime(schedule, schedule.endTime));
  const session = { id: randomId(), scheduleId, courseId: schedule.courseId, date: schedule.date, startAt: start.toISOString(), endAt: end.toISOString(), location: schedule.venue, latitude: 10.61, longitude: 12.19, radius: 50, token: randomId() + randomId(), status: 'open', demo: true };
  state.sessions.push(session); persist(); renderAll(); renderLecturerSchedules(); navigateTo('sessions'); showToast('Attendance session started for this scheduled class.'); openQrModal(session.id);
}

function bindStudentAuth() {
  const authModeNote = document.getElementById('authModeNote');
  if (window.NaubAuth?.enabled()) {
    authModeNote.textContent = 'Production mode: authentication, session handling, and role access are enforced by Supabase.';
  }
  document.querySelectorAll('[data-reset-password]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!window.NaubAuth?.enabled()) {
        showToast('Password recovery is available after Supabase is configured.', 'error');
        return;
      }
      const email = window.prompt('Enter the email address linked to your account.');
      if (!email) return;
      try {
        await window.NaubAuth.resetPassword(email.trim());
        showToast('If that account exists, a password reset email has been sent.');
      } catch (error) {
        console.warn('Password reset request failed:', error);
        showToast('Password reset could not be requested. Try again later.', 'error');
      }
    });
  });
  document.getElementById('studentRoleTab').addEventListener('click', () => setAuthRole('student'));
  document.getElementById('lecturerRoleTab').addEventListener('click', () => setAuthRole('lecturer'));
  document.getElementById('adminRoleTab').addEventListener('click', () => setAuthRole('admin'));
  document.getElementById('loginTab').addEventListener('click', () => setStudentAuthTab('login'));
  document.getElementById('registerTab').addEventListener('click', () => setStudentAuthTab('register'));
  document.querySelectorAll('[data-auth-tab]').forEach(button => {
    button.addEventListener('click', () => setStudentAuthTab(button.dataset.authTab));
  });
  document.getElementById('studentLoginPanel').addEventListener('submit', async event => {
    event.preventDefault();
    const matricNumber = normalizeMatric(document.getElementById('loginMatric').value);
    const password = document.getElementById('studentPassword').value;
    if (window.NaubAuth?.enabled()) {
      try {
        const account = await window.NaubAuth.signInStudent(matricNumber, password);
        enterDemoDashboard(account);
      } catch (error) {
        console.warn('Student authentication failed:', error);
        setAuthFeedback('loginFeedback', 'The matriculation number or password is incorrect.', true);
      } finally {
        document.getElementById('studentPassword').value = '';
      }
      return;
    }
    const account = DEMO_ACCOUNTS.student;
    document.getElementById('studentPassword').value = '';
    if (normalizeMatric(account.matricNumber) !== matricNumber || account.password !== password) {
      setAuthFeedback('loginFeedback', 'The matriculation number or password is incorrect. Please try again.', true);
      return;
    }
    enterDemoDashboard(account);
  });
  document.getElementById('adminLoginPanel').addEventListener('submit', async event => {
    event.preventDefault();
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    if (window.NaubAuth?.enabled()) {
      try {
        const account = await window.NaubAuth.signInPassword(username, password);
        if (account.role !== 'admin') throw new Error('role_not_allowed');
        enterDemoDashboard(account);
      } catch (error) {
        console.warn('Administrator authentication failed:', error);
        setAuthFeedback('adminFeedback', 'The credentials are invalid or this account is not authorized for the administrator portal.', true);
      } finally {
        document.getElementById('adminPassword').value = '';
      }
      return;
    }
    const isDemoAccount = username === DEMO_ACCOUNTS.admin.username && password === DEMO_ACCOUNTS.admin.password;
    document.getElementById('adminPassword').value = '';
    if (!isDemoAccount) {
      setAuthFeedback('adminFeedback', 'Those credentials do not match the public demo admin account. Use the sample account below.', true);
      return;
    }
    enterDemoDashboard(DEMO_ACCOUNTS.admin);
  });
  document.getElementById('lecturerLoginPanel').addEventListener('submit', async event => {
    event.preventDefault();
    const username = document.getElementById('lecturerUsername').value.trim();
    const password = document.getElementById('lecturerPassword').value;
    if (window.NaubAuth?.enabled()) {
      try {
        const account = await window.NaubAuth.signInPassword(username, password);
        if (account.role !== 'lecturer') throw new Error('role_not_allowed');
        enterDemoDashboard(account);
      } catch (error) {
        console.warn('Lecturer authentication failed:', error);
        setAuthFeedback('lecturerFeedback', 'The credentials are invalid or this account is not authorized for the lecturer portal.', true);
      } finally {
        document.getElementById('lecturerPassword').value = '';
      }
      return;
    }
    const isDemoAccount = username === DEMO_ACCOUNTS.lecturer.username && password === DEMO_ACCOUNTS.lecturer.password;
    document.getElementById('lecturerPassword').value = '';
    if (!isDemoAccount) {
      setAuthFeedback('lecturerFeedback', 'Those credentials do not match the public demo lecturer account. Use the sample account below.', true);
      return;
    }
    enterDemoDashboard(DEMO_ACCOUNTS.lecturer);
  });
  document.querySelectorAll('[data-demo-account]').forEach(button => {
    button.addEventListener('click', () => fillDemoAccount(button.dataset.demoAccount));
  });
  const registerForm = document.getElementById('studentRegisterPanel');
  const phoneInput = document.getElementById('registerPhone');
  const checkPhone = () => {
    const digits = phoneInput.value.replace(/\D/g, '');
    phoneInput.setCustomValidity(digits.length < 10 || digits.length > 15 ? 'Enter a phone number with 10 to 15 digits.' : '');
  };
  phoneInput.addEventListener('input', checkPhone);
  registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    checkPhone();
    if (!registerForm.reportValidity()) return;
    try {
      const details = {
        fullName: document.getElementById('registerName').value.trim(),
        matricNumber: normalizeMatric(document.getElementById('registerMatric').value),
        email: document.getElementById('registerEmail').value.trim(),
        password: document.getElementById('registerPassword').value,
        phone: phoneInput.value.trim(),
        faculty: document.getElementById('registerFaculty').value.trim(),
        department: document.getElementById('registerDepartment').value.trim(),
        level: document.getElementById('registerLevel').value,
        academicSession: document.getElementById('registerSession').value,
      };
      if (!window.NaubAuth?.enabled()) {
        setAuthFeedback('registerFeedback', 'Production registration is unavailable until Supabase is configured. The demo does not save account details.', true);
        return;
      }
      await window.NaubAuth.registerStudent(details);
      setAuthFeedback('registerFeedback', 'Registration submitted. An administrator must approve your account before you can sign in.', false);
      registerForm.reset();
      phoneInput.setCustomValidity('');
    } catch (error) {
      console.error('Unable to preview registration:', error);
      const messages = {
        matric_number_already_registered: 'That matriculation number is already registered.',
        email_already_registered: 'That email address is already registered.',
        invalid_registration_details: 'Check the registration details and try again.',
      };
      setAuthFeedback('registerFeedback', messages[error.message] || 'Registration could not be completed. No account details were saved.', true);
    }
  });
}

function openStudentPortal() {
  setAuthRole('student');
  setStudentAuthTab('login');
  setAuthFeedback('loginFeedback', '', false);
  setAuthFeedback('registerFeedback', '', false);
  setAuthFeedback('adminFeedback', '', false);
  openModal('studentAuthModal');
}

function setAuthRole(role) {
  const roles = {
    student: { label: 'Student portal', title: 'Welcome to your portal', eyebrow: 'STUDENT ACCESS', description: 'Sign in with your matriculation number and password or register as a Nigerian Army University Biu student.' },
    lecturer: { label: 'Lecturer portal', title: 'Lecturer sign in', eyebrow: 'LECTURER ACCESS', description: 'Use the separate lecturer demo account to preview the lecturer workspace.' },
    admin: { label: 'Admin portal', title: 'Admin sign in', eyebrow: 'ADMIN ACCESS', description: 'Use the separate administrator demo account to preview the dashboard.' },
  };
  const selected = roles[role] || roles.student;
  document.getElementById('studentRoleTab').classList.toggle('active', role === 'student');
  document.getElementById('lecturerRoleTab').classList.toggle('active', role === 'lecturer');
  document.getElementById('adminRoleTab').classList.toggle('active', role === 'admin');
  document.getElementById('studentRoleTab').setAttribute('aria-selected', String(role === 'student'));
  document.getElementById('lecturerRoleTab').setAttribute('aria-selected', String(role === 'lecturer'));
  document.getElementById('adminRoleTab').setAttribute('aria-selected', String(role === 'admin'));
  document.getElementById('studentRolePanel').classList.toggle('hidden', role !== 'student');
  document.getElementById('lecturerRolePanel').classList.toggle('hidden', role !== 'lecturer');
  document.getElementById('adminRolePanel').classList.toggle('hidden', role !== 'admin');
  document.querySelector('#studentAuthTitle').textContent = selected.title;
  document.querySelector('.student-auth-heading .eyebrow').textContent = selected.eyebrow;
  setAuthFeedback('adminFeedback', '', false);
  setAuthFeedback('lecturerFeedback', '', false);
}

function fillDemoAccount(role) {
  const account = DEMO_ACCOUNTS[role];
  if (!account) return;
  setAuthRole(account.role);
  if (account.role === 'student') {
    setStudentAuthTab('login');
    document.getElementById('loginMatric').value = account.matricNumber;
    document.getElementById('studentPassword').value = account.password;
  } else {
    document.getElementById(`${account.role}Username`).value = account.username;
    document.getElementById(`${account.role}Password`).value = account.password;
  }
}

function enterDemoDashboard(account, persistSession = true) {
  currentDemoAccount = account;
  if (persistSession) sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(account));
  document.body.classList.remove('auth-required');
  clearStudentAuthForms();
  closeModal('studentAuthModal');

  const isLecturer = account.role === 'lecturer';
  document.querySelectorAll('.page').forEach(section => {
    section.classList.toggle('active', isLecturer ? section.id === 'page-dashboard' : section.id === 'page-role-dashboard');
  });
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === 'dashboard');
    item.classList.toggle('hidden', account.role === 'student' && item.dataset.page !== 'dashboard');
  });
  document.querySelector('.workspace-label').textContent = `${account.role.toUpperCase()} WORKSPACE`;
  document.querySelector('.breadcrumb > span').textContent = `${account.role[0].toUpperCase()}${account.role.slice(1)} workspace`;
  document.getElementById('pageCrumb').textContent = 'Overview';
  document.getElementById('profileButton').setAttribute('aria-label', `Signed in to demo as ${account.name}`);
  document.querySelector('#profileButton .profile-copy strong').textContent = account.name;
  document.querySelector('#profileButton .profile-copy small').textContent = `${account.role[0].toUpperCase()}${account.role.slice(1)} · Nigerian Army University Biu`;
  document.querySelector('#profileButton .avatar').textContent = initialsFor(account.name);
  document.querySelector('.top-avatar').textContent = initialsFor(account.name);
  document.getElementById('portalButtonLabel').textContent = 'Sign out';
  document.querySelector('.student-portal-icon').innerHTML = '<use href="#icon-arrow-right"></use>';

  if (isLecturer) {
    document.getElementById('welcomeTitle').innerHTML = `Good morning, ${escapeHtml(account.name.replace(/^Dr\.\s*/, '').split(' ')[0])} ${svgIcon('star', 'title-icon')}`;
    document.getElementById('pageCrumb').textContent = 'Overview';
  } else {
    renderRoleDashboard(account);
  }
  if (account.production) {
    showToast(`Signed in as ${account.name}.`);
    refreshRemoteData().then(() => { if (account.role === 'student') resumePendingScan(); });
    return;
  }
  showToast(`${account.role[0].toUpperCase()}${account.role.slice(1)} demo dashboard opened.`);
  if (account.role === 'student') resumePendingScan();
}

async function demoSignOut() {
  if (currentDemoAccount?.production && window.NaubAuth?.enabled()) {
    try {
      await window.NaubAuth.signOut();
    } catch (error) {
      console.error('Unable to sign out of Supabase:', error);
      showToast('Sign out could not be completed. Please try again.', 'error');
      return;
    }
  }
  currentDemoAccount = null;
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  document.body.classList.add('auth-required');
  openStudentPortal();
}

function renderRoleDashboard(account) {
  const container = document.getElementById('roleDashboardContent');
  container.innerHTML = account.role === 'student'
    ? renderStudentDashboard(account)
    : renderAdminDashboard(account);
  if (account.role === 'admin') bindAdminBookingFilters();
}

function contactRecords(role) {
  if (role === 'student') return [CONTACTS.lecturer, CONTACTS.admin];
  if (role === 'lecturer') {
    return [CONTACTS.admin, ...STUDENTS.map((student, index) => ({
      id: `student-${student.id}`, role: 'Student', name: student.name, phone: `+234803${String(100000 + index).slice(-6)}`,
      email: `${student.matric.toLowerCase()}@student.naub.edu.ng`, detail: `${student.matric} · enrolled student`,
    }))];
  }
  return [CONTACTS.lecturer, ...STUDENTS.map((student, index) => ({
    id: `student-${student.id}`, role: 'Student', name: student.name, phone: `+234803${String(100000 + index).slice(-6)}`,
    email: `${student.matric.toLowerCase()}@student.naub.edu.ng`, detail: `${student.matric} · student`,
  }))];
}

function renderContactPanel(role) {
  const records = contactRecords(role);
  const label = role === 'student' ? 'Lecturers and attendance support' : role === 'lecturer' ? 'Students and administration' : 'Lecturers and students';
  return `<section class="panel contact-panel"><div class="panel-heading"><div><h2>Contact directory</h2><p>${label}. Call or send a direct message.</p></div></div><div class="contact-list">${records.map(contact => `
    <article class="contact-card"><span class="student-avatar">${escapeHtml(initialsFor(contact.name))}</span><div class="contact-card-copy"><strong>${escapeHtml(contact.name)}</strong><small>${escapeHtml(contact.role)} · ${escapeHtml(contact.detail)}</small></div><div class="contact-actions"><a class="icon-button" href="tel:${escapeHtml(contact.phone)}" aria-label="Call ${escapeHtml(contact.name)}" title="Call"><svg class="ui-icon"><use href="#icon-phone"/></svg></a><button class="icon-button" type="button" data-contact-message="${escapeHtml(contact.id)}" aria-label="Message ${escapeHtml(contact.name)}" title="Message"><svg class="ui-icon"><use href="#icon-message"/></svg></button></div></article>`).join('')}</div><p class="field-hint">Phone numbers and messages are demo contacts in this browser preview. Production direct messaging should be connected to the university directory and notification service.</p></section>`;
}

function findContact(id) {
  return [CONTACTS.lecturer, CONTACTS.admin, ...STUDENTS.map((student, index) => ({
    id: `student-${student.id}`, role: 'Student', name: student.name, phone: `+234803${String(100000 + index).slice(-6)}`,
    email: `${student.matric.toLowerCase()}@student.naub.edu.ng`, detail: student.matric,
  }))].find(contact => contact.id === id);
}

function openContactModal(contactId) {
  const contact = findContact(contactId);
  if (!contact) {
    showToast('This contact is no longer available.', 'error');
    return;
  }
  document.getElementById('contactRecipientId').value = contact.id;
  document.getElementById('contactRecipient').textContent = `${contact.role} · ${contact.name} · ${contact.phone}`;
  document.getElementById('contactMessage').value = '';
  document.getElementById('contactError').classList.add('hidden');
  openModal('contactModal');
}

function renderStudentDashboard(account) {
  const student = STUDENTS.find(item => item.matric === account.matricNumber) || STUDENTS[0];
  const courses = student.courseIds.map(courseId => courseById(courseId));
  const attendanceHistory = [
    { course: courses[0], daysAgo: 1, status: 'Present' },
    { course: courses[1], daysAgo: 3, status: 'Present' },
    { course: courses[0], daysAgo: 5, status: 'Present' },
  ];
  const courseCards = courses.map(course => `
    <article class="student-course-card">
      <div class="student-course-heading"><span class="course-monogram ${escapeHtml(course.tint)}">${escapeHtml(course.code.split(' ').map(part => part[0]).join(''))}</span><div><strong>${escapeHtml(course.code)}</strong><small>${escapeHtml(course.name)}</small></div></div>
      <div class="student-course-rate"><strong>${course.rate}%</strong><span>attendance</span></div>
      <div class="progress-track"><div class="progress-fill ${course.rate < THRESHOLD ? 'warn' : ''}" style="width:${course.rate}%"></div></div>
      <small class="student-course-foot">Sample semester attendance rate${course.rate < THRESHOLD ? ' · Below 75% threshold' : ''}</small>
    </article>`).join('');
  const attendanceRows = courses.map(course => {
    const total = 12;
    const present = Math.round(total * course.rate / 100);
    const absent = total - present;
    return `<tr><td>${escapeHtml(course.code)} · ${escapeHtml(course.name)}</td><td><span class="attendance-meter"><i class="${course.rate < THRESHOLD ? 'low' : ''}" style="width:${course.rate}%"></i></span>${course.rate}%</td><td><div class="attendance-breakdown"><span class="present">${present} present</span><span class="absent">${absent} absent</span></div></td><td><span class="table-status ${course.rate < THRESHOLD ? 'at-risk' : ''}">${course.rate < THRESHOLD ? 'Below threshold' : 'On track'}</span></td></tr>`;
  }).join('');
  const historyRows = attendanceHistory.map(item => {
    const date = new Date();
    date.setDate(date.getDate() - item.daysAgo);
    return `<tr><td>${escapeHtml(item.course.code)} · ${escapeHtml(item.course.name)}</td><td>${escapeHtml(date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }))}</td><td><span class="table-status">${item.status}</span></td></tr>`;
  }).join('');
  const nextSession = [...state.sessions].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)).find(session => Date.parse(session.endAt) > Date.now());

  return `
    <div class="demo-banner role-demo-banner" role="note"><span class="demo-dot"></span><span><strong>Student demo dashboard</strong> · Attendance figures and history are sample data, not official records.</span></div>
    <div class="welcome-row page-intro"><div><p class="eyebrow">STUDENT WORKSPACE</p><h1 id="roleDashboardTitle">Welcome, ${escapeHtml(account.name.split(' ')[0])}</h1><p class="subheading">Your classes and attendance at a glance.</p></div><span class="tracking-id-chip">Matric no. · ${escapeHtml(account.matricNumber)}</span></div>
    <div class="stat-grid role-stat-grid" aria-label="Student attendance summary">
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Semester attendance</span><span class="stat-icon icon-green">◉</span></div><div class="stat-value">${student.rate}<span class="value-percent">%</span></div><div class="stat-foot"><span class="trend-up">Above 75%</span> eligibility threshold</div></article>
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Classes attended</span><span class="stat-icon icon-blue">${svgIcon('grid', 'ui-icon')}</span></div><div class="stat-value">${student.attended}<span class="value-percent"> / 12</span></div><div class="stat-foot">Sample semester sessions</div></article>
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Enrolled courses</span><span class="stat-icon icon-lilac">${svgIcon('users', 'ui-icon')}</span></div><div class="stat-value">${courses.length}</div><div class="stat-foot">For 2025/2026 · First Semester</div></article>
    </div>
    <div class="section-heading role-section-heading"><div><h2>My course attendance</h2><p>Keep track of your semester progress.</p></div></div>
    <div class="student-course-grid">${courseCards}</div>
    <section class="panel my-class-schedule"><div class="panel-heading"><div><h2>My Class Schedule</h2><p>Latest updates for your enrolled courses</p></div></div><div class="schedule-list">${renderStudentSchedules(student)}</div></section>
    <section class="panel notifications-panel"><div class="panel-heading"><div><h2>Schedule notifications</h2><p>Published class changes</p></div></div>${renderScheduleNotifications(account)}</section>
    <section class="panel"><div class="panel-heading"><div><h2>Attendance by course</h2><p>Present and absent sessions for every enrolled course</p></div></div><div class="table-scroll"><table class="student-attendance-table"><thead><tr><th>COURSE</th><th>PERCENTAGE</th><th>SESSIONS</th><th>STATUS</th></tr></thead><tbody>${attendanceRows}</tbody></table></div></section>
    ${renderContactPanel('student')}
    <div class="dashboard-bottom role-dashboard-bottom">
      <section class="panel role-table-panel"><div class="panel-heading"><div><h2>Recent attendance</h2><p>Example history for the student demo account</p></div></div><div class="table-scroll"><table><thead><tr><th>COURSE</th><th>DATE</th><th>STATUS</th></tr></thead><tbody>${historyRows}</tbody></table></div></section>
      <section class="panel next-class-panel"><div class="panel-heading"><div><h2>Next class</h2><p>Your upcoming session</p></div><span class="stat-icon icon-blue">${svgIcon('grid', 'ui-icon')}</span></div>${nextSession ? `<div class="next-class-course">${escapeHtml(courseById(nextSession.courseId).code)} · ${escapeHtml(courseById(nextSession.courseId).name)}</div><p>${escapeHtml(nextSession.location)}</p><p>${escapeHtml(formatDate(nextSession.date))} · ${escapeHtml(formatTime(nextSession.startAt))}</p>` : '<p>No upcoming sample classes are scheduled.</p>'}<p class="field-hint">Scan your lecturer’s session QR code to check in. This preview does not submit attendance.</p></section>
    </div>`;
}

function renderStudentSchedules(student) {
  const schedules = state.schedules.filter(schedule => student.courseIds.includes(schedule.courseId)).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  return schedules.map(schedule => {
    const course = courseById(schedule.courseId);
    const venue = venueById(schedule.venueId);
    return `<article class="schedule-card student-schedule-card"><div class="schedule-details"><strong>${escapeHtml(course.code)} · ${escapeHtml(course.name)}</strong><small>Lecturer: ${escapeHtml(schedule.lecturerName || 'Dr. Amina Yusuf')}</small><p>${escapeHtml(formatDate(schedule.date))} · ${escapeHtml(schedule.startTime)}–${escapeHtml(schedule.endTime)}</p><p><strong>Faculty:</strong> ${escapeHtml(venue?.faculty || 'Faculty not specified')} · <strong>Venue:</strong> ${escapeHtml(venue?.name || schedule.venue)} · <strong>Campus:</strong> ${escapeHtml(venue?.campus || 'Campus not specified')}</p>${schedule.instructions ? `<p><strong>Instructions:</strong> ${escapeHtml(schedule.instructions)}</p>` : ''}</div><span class="table-status schedule-status status-${scheduleStatus(schedule).toLowerCase()}">${scheduleStatus(schedule)}</span></article>`;
  }).join('') || '<div class="empty-state"><strong>No classes scheduled</strong>Classes for your enrolled courses will appear here.</div>';
}

function renderScheduleNotifications(account) {
  const student = STUDENTS.find(item => item.matric === account.matricNumber) || STUDENTS[0];
  const notifications = state.notifications.filter(item => item.studentId === student.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return notifications.length ? notifications.slice(0, 8).map(item => `<article class="schedule-notification"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></article>`).join('') : '<p class="field-hint">Schedule changes will appear here.</p>';
}

function bindVenueManagement() {
  document.getElementById('venueForm').addEventListener('submit', event => {
    event.preventDefault();
    const venue = {
      id: editingVenueId || randomId(),
      name: document.getElementById('venueName').value.trim(),
      type: document.getElementById('venueType').value,
      faculty: document.getElementById('venueFaculty').value.trim(),
      department: document.getElementById('venueDepartment').value.trim(),
      campus: document.getElementById('venueCampus').value.trim(),
      building: document.getElementById('venueBuilding').value.trim(),
      floor: document.getElementById('venueFloor').value.trim(),
      capacity: Number(document.getElementById('venueCapacity').value),
      status: document.getElementById('venueStatus').value,
      bufferMinutes: Number(document.getElementById('venueBuffer').value || 0),
    };
    const duplicate = state.venues.some(item => item.id !== venue.id
      && item.name.toLowerCase() === venue.name.toLowerCase()
      && (item.building || '').toLowerCase() === venue.building.toLowerCase()
      && item.campus.toLowerCase() === venue.campus.toLowerCase());
    if (duplicate) {
      const error = document.getElementById('venueError');
      error.textContent = 'A venue with this name already exists in the same building and campus.';
      error.classList.remove('hidden');
      return;
    }
    if (isProduction()) {
      const venueId = editingVenueId;
      runRemote(() => window.NaubData.saveVenue(venueId, venue), venueId ? 'Venue details updated.' : 'Venue added.')
        .then(result => { if (result !== undefined) { closeModal('venueModal'); editingVenueId = null; } });
      return;
    }
    const index = state.venues.findIndex(item => item.id === venue.id);
    if (index >= 0) {
      state.venueHistory.push({ venueId: venue.id, previous: state.venues[index], changedAt: new Date().toISOString() });
      state.venues[index] = venue;
    } else state.venues.push(venue);
    persist();
    closeModal('venueModal');
    renderRoleDashboard(currentDemoAccount);
    showToast(index >= 0 ? 'Venue details updated.' : 'Venue added.');
    editingVenueId = null;
  });
}

function openVenueForm(venueId = null) {
  editingVenueId = venueId;
  const venue = venueId ? venueById(venueId) : null;
  document.getElementById('venueModalTitle').textContent = venue ? 'Edit venue' : 'Add venue';
  document.getElementById('venueName').value = venue?.name || '';
  document.getElementById('venueType').value = venue?.type || 'Lecture Hall';
  document.getElementById('venueFaculty').value = venue?.faculty || '';
  document.getElementById('venueDepartment').value = venue?.department || '';
  document.getElementById('venueCampus').value = venue?.campus || '';
  document.getElementById('venueBuilding').value = venue?.building || '';
  document.getElementById('venueFloor').value = venue?.floor || '';
  document.getElementById('venueCapacity').value = venue?.capacity || '';
  document.getElementById('venueStatus').value = venue?.status || 'available';
  document.getElementById('venueBuffer').value = venue?.bufferMinutes || 0;
  document.getElementById('venueError').classList.add('hidden');
  openModal('venueModal');
}

function toggleVenue(venueId) {
  const venue = venueById(venueId);
  if (!venue) return;
  venue.status = venue.status === 'available' ? 'unavailable' : 'available';
  state.venueHistory.push({ venueId, action: venue.status, changedAt: new Date().toISOString() });
  persist();
  renderRoleDashboard(currentDemoAccount);
  showToast(venue.status === 'available' ? 'Venue is available for booking.' : 'Venue marked unavailable.');
}

function renderVenueManagement() {
  const rows = state.venues.map(venue => {
    const bookings = state.schedules.filter(schedule => schedule.venueId === venue.id && schedule.status !== 'cancelled').length;
    const status = venue.status === 'available' ? 'Available' : 'Unavailable';
    return `<article class="venue-card"><div class="venue-card-copy"><strong>${escapeHtml(venueLabel(venue))}</strong><small>${escapeHtml(venue.building || 'Building not specified')} · ${escapeHtml(venue.floor || 'Location not specified')} · ${escapeHtml(venue.type)} · ${venue.capacity} seats</small><small>${escapeHtml(venue.department || 'Department not specified')} · ${bookings} active booking${bookings === 1 ? '' : 's'}</small></div><span class="table-status venue-${venue.status}">${status}</span><div class="venue-actions"><button class="button button-small button-outline" type="button" data-edit-venue="${venue.id}">Edit</button><button class="button button-small button-outline" type="button" data-toggle-venue="${venue.id}">${venue.status === 'available' ? 'Mark unavailable' : 'Make available'}</button></div></article>`;
  }).join('');
  return `<section class="panel venue-management"><div class="panel-heading"><div><h2>Venue Management</h2><p>Manage faculties, campuses, capacity, and maintenance availability.</p></div><button class="button button-primary button-small" type="button" data-new-venue>${svgIcon('plus')} Add venue</button></div><div class="venue-list">${rows || '<div class="empty-state"><strong>No venues registered</strong>Add a venue to enable classroom booking.</div>'}</div></section>`;
}

function renderVenueBookings() {
  const activeSchedules = state.schedules.filter(schedule => {
    const venue = venueById(schedule.venueId);
    return schedule.status !== 'cancelled'
      && (!adminBookingFilters.date || schedule.date === adminBookingFilters.date)
      && (!adminBookingFilters.venueId || schedule.venueId === adminBookingFilters.venueId)
      && (!adminBookingFilters.faculty || venue?.faculty === adminBookingFilters.faculty)
      && (!adminBookingFilters.lecturer || (schedule.lecturerName || '').toLowerCase().includes(adminBookingFilters.lecturer.toLowerCase()));
  });
  const rows = activeSchedules.map(schedule => {
    const venue = venueById(schedule.venueId);
    const course = courseById(schedule.courseId);
    return `<tr><td>${escapeHtml(venueLabel(venue))}</td><td>${escapeHtml(course.code)}</td><td>${escapeHtml(schedule.lecturerName || 'Lecturer')}</td><td>${escapeHtml(formatDate(schedule.date))}</td><td>${escapeHtml(schedule.startTime)}–${escapeHtml(schedule.endTime)}</td></tr>`;
  }).join('');
  const faculties = [...new Set(state.venues.map(venue => venue.faculty))].sort();
  return `<section class="panel venue-bookings"><div class="panel-heading"><div><h2>Venue bookings</h2><p>Filter bookings by date, venue, faculty, or lecturer.</p></div></div><div class="booking-filters"><input id="adminBookingDate" type="date" value="${escapeHtml(adminBookingFilters.date)}" aria-label="Filter bookings by date"><select id="adminBookingVenue" aria-label="Filter bookings by venue"><option value="">All venues</option>${state.venues.map(venue => `<option value="${venue.id}" ${venue.id === adminBookingFilters.venueId ? 'selected' : ''}>${escapeHtml(venueLabel(venue))}</option>`).join('')}</select><select id="adminBookingFaculty" aria-label="Filter bookings by faculty"><option value="">All faculties</option>${faculties.map(faculty => `<option ${faculty === adminBookingFilters.faculty ? 'selected' : ''}>${escapeHtml(faculty)}</option>`).join('')}</select><input id="adminBookingLecturer" type="search" placeholder="Lecturer name" value="${escapeHtml(adminBookingFilters.lecturer)}"></div><div class="table-scroll"><table><thead><tr><th>VENUE / FACULTY</th><th>COURSE</th><th>LECTURER</th><th>DATE</th><th>TIME</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No active venue bookings.</td></tr>'}</tbody></table></div></section>`;
}

function bindAdminBookingFilters() {
  [['adminBookingDate', 'date'], ['adminBookingVenue', 'venueId'], ['adminBookingFaculty', 'faculty'], ['adminBookingLecturer', 'lecturer']].forEach(([id, key]) => {
    const element = document.getElementById(id);
    if (element) element.addEventListener('input', event => {
      adminBookingFilters[key] = event.target.value;
      renderRoleDashboard(currentDemoAccount);
    });
  });
}

function renderAdminDashboard(account) {
  const sessions = [...state.sessions].sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt)).slice(0, 4);
  const sessionRows = sessions.map(session => {
    const course = courseById(session.courseId);
    return `<tr><td>${escapeHtml(course.code)} · ${escapeHtml(course.name)}</td><td>${escapeHtml(formatDate(session.date))}</td><td>${checkinsFor(session.id).length} / ${course.students}</td><td><span class="table-status">${escapeHtml(statusLabel(getSessionStatus(session)))}</span></td></tr>`;
  }).join('');
  return `
    <div class="demo-banner role-demo-banner" role="note"><span class="demo-dot"></span><span><strong>Admin demo dashboard</strong> · All figures are sample data held in this browser.</span></div>
    <div class="welcome-row page-intro"><div><p class="eyebrow">UNIVERSITY ADMINISTRATION</p><h1 id="roleDashboardTitle">Welcome, ${escapeHtml(account.name)}</h1><p class="subheading">Sample university attendance overview.</p></div></div>
    <div class="stat-grid role-stat-grid" aria-label="University overview">
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Sample students</span><span class="stat-icon icon-lilac">${svgIcon('users', 'ui-icon')}</span></div><div class="stat-value">${STUDENTS.length}</div><div class="stat-foot">Demo roster records</div></article>
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Courses</span><span class="stat-icon icon-blue">${svgIcon('grid', 'ui-icon')}</span></div><div class="stat-value">${COURSES.length}</div><div class="stat-foot">Sample course catalogue</div></article>
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Class sessions</span><span class="stat-icon icon-green">◉</span></div><div class="stat-value">${state.sessions.length}</div><div class="stat-foot">Stored in this browser only</div></article>
      <article class="stat-card"><div class="stat-top"><span class="stat-label">At-risk students</span><span class="stat-icon icon-orange">${svgIcon('users', 'ui-icon')}</span></div><div class="stat-value">${STUDENTS.filter(student => student.rate < THRESHOLD).length}</div><div class="stat-foot">Below the sample 75% threshold</div></article>
    </div>
    <section class="panel admin-session-panel"><div class="panel-heading"><div><h2>Recent class sessions</h2><p>Sample sessions across the university workspace</p></div><button class="text-button" type="button" data-admin-view="sessions">Open session list ${svgIcon('arrow-right')}</button></div><div class="table-scroll"><table><thead><tr><th>COURSE</th><th>DATE</th><th>CHECK-INS</th><th>STATUS</th></tr></thead><tbody>${sessionRows || '<tr><td colspan="4">No sample sessions are available.</td></tr>'}</tbody></table></div></section>
    ${renderVenueManagement()}
    ${renderVenueBookings()}
    ${renderContactPanel('admin')}
    <div class="admin-quick-links"><button class="button button-outline" type="button" data-admin-view="students">View student roster</button><button class="button button-outline" type="button" data-admin-view="reports">Open attendance reports</button></div>`;
}

function initialsFor(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
}

function setStudentAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('loginTab').classList.toggle('active', isLogin);
  document.getElementById('registerTab').classList.toggle('active', !isLogin);
  document.getElementById('loginTab').setAttribute('aria-selected', String(isLogin));
  document.getElementById('registerTab').setAttribute('aria-selected', String(!isLogin));
  document.getElementById('studentLoginPanel').classList.toggle('hidden', !isLogin);
  document.getElementById('studentRegisterPanel').classList.toggle('hidden', isLogin);
  document.getElementById('studentAuthTitle').textContent = isLogin ? 'Welcome to your portal' : 'Create your student account';
  setAuthFeedback('loginFeedback', '', false);
  setAuthFeedback('registerFeedback', '', false);
}

function makePreviewTrackingId() {
  if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
    throw new Error('Secure browser randomness is not available.');
  }
  const bytes = new Uint8Array(4);
  window.crypto.getRandomValues(bytes);
  const suffix = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `OT-${suffix}`;
}

function setAuthFeedback(id, message, isError) {
  const feedback = document.getElementById(id);
  feedback.textContent = message;
  feedback.classList.toggle('hidden', !message);
  feedback.classList.toggle('error', isError);
}

function bindDeviceManagement() {
  const deviceForm = document.getElementById('deviceChangeForm');
  document.getElementById('requestDeviceChangeBtn')?.addEventListener('click', () => openModal('deviceChangeModal'));
  deviceForm?.addEventListener('submit', event => {
    event.preventDefault();
    const request = { id: `DCR-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, studentId: 'u1', label: document.getElementById('deviceLabel').value.trim(), type: document.getElementById('deviceType').value, reason: document.getElementById('deviceReason').value, notes: document.getElementById('deviceNotes').value.trim(), status: 'Pending', verification: 'Required', requestedAt: new Date().toISOString() };
    state.deviceRequests = [request, ...(state.deviceRequests || [])];
    persist(); renderDevicePages(); closeModal('deviceChangeModal'); deviceForm.reset(); showToast(`Request ${request.id} submitted for review.`);
  });
  renderDevicePages();
}

function renderDevicePages() {
  const devices = document.getElementById('deviceList');
  const currentId = deviceIdFor('u1');
  if (devices) devices.innerHTML = (state.devices || []).map(device => `<article class="device-card"><div class="device-card-icon">▣</div><div class="device-card-copy"><strong>${escapeHtml(device.label)}</strong><span>${escapeHtml(device.type)} · ${escapeHtml(device.browser)}</span><small>Registered ${escapeHtml(formatDate(device.registeredAt.slice(0, 10)))} · Last seen ${escapeHtml(formatDate(device.lastSeen.slice(0, 10)))}</small></div><span class="table-status ${device.status !== 'Active' ? 'at-risk' : ''}">${escapeHtml(device.status)}${device.id === currentId ? ' · Current' : ''}</span></article>`).join('') || '<div class="empty-state">No registered devices yet.</div>';
  const approvals = document.getElementById('deviceApprovalTableBody');
  if (approvals) approvals.innerHTML = (state.deviceRequests || []).map(request => `<tr><td><strong>Chiamaka Okafor</strong><small class="table-subtext">190401001</small></td><td>${escapeHtml(request.label)}<small class="table-subtext">${escapeHtml(request.type)}</small></td><td>${escapeHtml(request.reason)}</td><td><span class="table-status at-risk">${escapeHtml(request.verification)}</span></td><td><span class="table-status at-risk">${escapeHtml(request.status)}</span></td><td>${request.status === 'Pending' ? `<button class="button button-small button-primary" data-approve-device="${escapeHtml(request.id)}">Approve</button><button class="button button-small button-outline" data-reject-device="${escapeHtml(request.id)}">Reject</button>` : escapeHtml(request.id)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty-state">No device requests require review.</td></tr>';
  document.querySelectorAll('[data-approve-device]').forEach(button => button.onclick = () => updateDeviceRequest(button.dataset.approveDevice, 'Approved'));
  document.querySelectorAll('[data-reject-device]').forEach(button => button.onclick = () => updateDeviceRequest(button.dataset.rejectDevice, 'Rejected'));
}

function updateDeviceRequest(id, status) {
  const request = (state.deviceRequests || []).find(item => item.id === id);
  if (!request) return;
  request.status = status; request.reviewedAt = new Date().toISOString(); request.reviewer = 'authorized-staff';
  if (status === 'Approved') state.devices.unshift({ id: randomId(), label: request.label, type: request.type, browser: navigator.userAgent.slice(0, 80), registeredAt: new Date().toISOString(), lastSeen: new Date().toISOString(), status: 'Active' });
  persist(); renderDevicePages(); showToast(`Device request ${status.toLowerCase()}.`, status === 'Rejected' ? 'error' : 'success');
}

function bindRoleSwitcher() {
  const roleSelect = document.getElementById('roleSelect');
  roleSelect.addEventListener('change', () => {
    const role = roleSelect.value;
    document.body.dataset.role = role;
    const labels = { lecturer: 'Lecturer workspace', admin: 'Admin workspace', student: 'Student workspace' };
    document.querySelector('.workspace-label').textContent = labels[role];
    document.querySelector('.breadcrumb > span').textContent = labels[role];
    document.querySelector('.profile-copy small').textContent = role === 'admin' ? 'Administrator · NAUB' : role === 'student' ? 'Student · NAUB' : 'Lecturer · NAUB';
    document.querySelector('.profile-copy strong').textContent = role === 'admin' ? 'Ibrahim Sule' : role === 'student' ? 'Chiamaka Okafor' : 'Dr. Amina Yusuf';
    document.querySelector('.top-avatar').textContent = role === 'admin' ? 'IS' : role === 'student' ? 'CO' : 'AY';
    document.querySelector('.avatar').textContent = role === 'admin' ? 'IS' : role === 'student' ? 'CO' : 'AY';
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('hidden', (item.classList.contains('admin-only') && role !== 'admin') || (item.classList.contains('student-only') && role !== 'student') || (item.classList.contains('lecturer-only') && role !== 'lecturer')));
    navigateTo(role === 'admin' ? 'admin' : role === 'student' ? 'student' : 'dashboard');
  });
  document.querySelectorAll('[data-demo-action]').forEach(button => button.addEventListener('click', () => showToast('This action is part of the demonstration view.')));
}

function navigateTo(page) {
  const title = { dashboard: 'Overview', admin: 'Admin overview', student: 'Student overview', sessions: 'Class sessions', students: 'My students', reports: 'Attendance reports', lecturers: 'Lecturer management', courses: 'Course management', approvals: 'Approval center', 'student-approvals': 'Student approvals', 'registration-status': 'Registration status', devices: 'My devices', 'device-approvals': 'Device approvals' }[page];
  if (!title) return;
  if (currentDemoAccount && currentDemoAccount.role === 'student') return;
  if (currentDemoAccount && currentDemoAccount.role === 'admin' && page === 'dashboard') {
    document.querySelectorAll('.page').forEach(section => {
      section.classList.toggle('active', section.id === 'page-role-dashboard');
    });
    document.getElementById('pageCrumb').textContent = 'Overview';
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === 'dashboard'));
    return;
  }
  if (currentDemoAccount && currentDemoAccount.role === 'admin' && !['sessions', 'students', 'reports'].includes(page)) return;
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  document.querySelectorAll('.page').forEach(section => section.classList.toggle('active', section.id === `page-${page}`));
  document.getElementById('pageCrumb').textContent = title;
  closeMobileMenu();
}

function bindSessionForm() {
  document.getElementById('sessionForm').addEventListener('submit', event => {
    event.preventDefault();
    const error = document.getElementById('sessionError');
    error.classList.add('hidden');
    const date = document.getElementById('sessionDate').value;
    const startText = document.getElementById('sessionStart').value;
    const endText = document.getElementById('sessionEnd').value;
    const startAt = new Date(`${date}T${startText}`);
    const endAt = new Date(`${date}T${endText}`);
    const radius = Number(document.getElementById('sessionRadius').value);
    const latitude = Number(document.getElementById('sessionLat').value);
    const longitude = Number(document.getElementById('sessionLng').value);
    if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
      return formError(error, 'End time must be later than start time. Overnight sessions are not available in this MVP.');
    }
    if (radius < 10 || radius > 2000) return formError(error, 'Choose a radius between 10 and 2,000 metres.');
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return formError(error, 'Enter a valid classroom latitude and longitude.');
    }
    const course = COURSES.find(item => item.id === document.getElementById('sessionCourse').value);
    const locationName = document.getElementById('sessionLocation').value.trim();
    const topic = document.getElementById('sessionTopic').value.trim();
    if (!topic) return formError(error, 'Add a lecture topic.');
    if (!locationName) return formError(error, 'Add a classroom or venue name.');
    const overlap = state.sessions.some(item => item.id !== editingSessionId && item.courseId === document.getElementById('sessionCourse').value && item.date === date && item.status !== 'finalized' && startAt < new Date(item.endAt) && endAt > new Date(item.startAt));
    if (overlap) return formError(error, 'This course already has an overlapping attendance session.');
    if (isProduction()) {
      const sessionId = editingSessionId;
      const details = { courseId: course.id, startAt: startAt.toISOString(), endAt: endAt.toISOString(), location: locationName, latitude, longitude, radius };
      runRemote(() => (sessionId ? window.NaubData.updateSession(sessionId, details).then(() => sessionId) : window.NaubData.createSession(details)),
        sessionId ? 'Session updated.' : 'Class session created. Share the QR code with your students.')
        .then(id => { if (id) { closeModal('sessionModal'); editingSessionId = null; openQrModal(id); } });
      return;
    }
    let session;
    if (editingSessionId) {
      session = state.sessions.find(item => item.id === editingSessionId);
      if (!session || session.status === 'closed') return formError(error, 'This session can no longer be edited.');
      Object.assign(session, {
        courseId: course.id,
        date,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        location: locationName,
        topic,
        expiresIn: QR_ROTATION_SECONDS,
        latitude,
        longitude,
        radius,
        editedAt: new Date().toISOString(),
      });
    } else {
      session = {
        id: randomId(),
        courseId: course.id,
        date,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        location: locationName,
        topic,
        expiresIn: QR_ROTATION_SECONDS,
        latitude,
        longitude,
        radius,
        token: randomId() + randomId(),
        status: 'open',
        demo: false,
      };
      state.sessions.unshift(session);
    }
    persist();
    closeModal('sessionModal');
    renderAll();
    openQrModal(session.id);
    showToast(editingSessionId ? 'Session updated.' : 'Class session created. Share the QR code with your students.');
    editingSessionId = null;
  });
}

function openSessionForm(sessionId = null) {
  editingSessionId = sessionId;
  const session = sessionId ? state.sessions.find(item => item.id === sessionId) : null;
  if (session) {
    const start = new Date(session.startAt);
    const end = new Date(session.endAt);
    document.getElementById('sessionDate').value = session.date;
    document.getElementById('sessionStart').value = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
    document.getElementById('sessionEnd').value = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
    document.getElementById('sessionCourse').value = session.courseId;
    document.getElementById('sessionTopic').value = session.topic || 'Regular lecture';
    document.getElementById('sessionRadius').value = session.radius;
    document.getElementById('sessionLocation').value = session.location;
    document.getElementById('sessionLat').value = session.latitude;
    document.getElementById('sessionLng').value = session.longitude;
  } else {
    setSessionDefaults();
    document.getElementById('sessionLocation').value = 'Nigerian Army University Biu Main Campus';
    document.getElementById('sessionLat').value = '10.61';
    document.getElementById('sessionLng').value = '12.19';
    document.getElementById('sessionRadius').value = 50;
  }
  document.getElementById('modalTitle').textContent = session ? 'Edit class session' : 'Set up your class';
  document.querySelector('#sessionForm button[type="submit"]').innerHTML = session ? `Save changes ${svgIcon('arrow-right')}` : `Create session ${svgIcon('arrow-right')}`;
  document.getElementById('sessionError').classList.add('hidden');
  openModal('sessionModal');
}

function setSessionDefaults() {
  const now = new Date();
  const start = new Date(now.getTime() + 5 * 60_000);
  const end = new Date(now.getTime() + 65 * 60_000);
  document.getElementById('sessionDate').value = localDate(now);
  document.getElementById('sessionStart').value = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  document.getElementById('sessionEnd').value = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  document.getElementById('sessionCourse').value = COURSES[0].id;
  document.getElementById('sessionTopic').value = '';
}

function populateCourseSelects() {
  const markup = COURSES.map(course => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.code)} · ${escapeHtml(course.name)}</option>`).join('');
  document.getElementById('sessionCourse').innerHTML = markup;
  ['rosterCourse', 'reportCourse'].forEach(id => {
    document.getElementById(id).insertAdjacentHTML('beforeend', markup);
  });
  document.getElementById('rosterCourse').addEventListener('change', renderStudents);
  document.getElementById('reportCourse').addEventListener('change', renderReport);
  document.getElementById('studentSearch').addEventListener('input', renderStudents);
}

function bindScanFlow() {
  document.getElementById('checkInBtn').addEventListener('click', () => checkIn(false));
  document.getElementById('demoLocationBtn').addEventListener('click', () => checkIn(true));
  document.getElementById('copySessionUrl').addEventListener('click', copySessionUrl);
  document.getElementById('printQrBtn').addEventListener('click', () => window.print());
  document.getElementById('closeSessionBtn').addEventListener('click', closeActiveSession);
  document.getElementById('rotateQrBtn').addEventListener('click', rotateSessionQr);
  document.getElementById('finalizeSessionBtn').addEventListener('click', finalizeActiveSession);
  document.getElementById('fullscreenQrBtn').addEventListener('click', toggleQrFullscreen);
  document.getElementById('startCameraBtn').addEventListener('click', startCameraScanner);
  document.getElementById('stopCameraBtn').addEventListener('click', stopCameraScanner);
  document.getElementById('testScanBtn').addEventListener('click', () => {
    const session = state.sessions.find(item => item.id === activeSessionId);
    if (session) {
      closeModal('qrModal');
      openScanModal(session);
    }
  });
}

function openQrModal(sessionId) {
  const session = state.sessions.find(item => item.id === sessionId);
  if (!session) return;
  activeSessionId = session.id;
  if (isProduction() && !session.token) {
    if (session.status === 'open') rotateSessionQr();
    else showToast('This session is closed; its QR code is no longer available.', 'error');
    return;
  }
  const course = courseById(session.courseId);
  document.getElementById('qrTitle').textContent = `${course.code} session QR`;
  document.getElementById('qrCourseName').textContent = `${course.code} · ${course.name}`;
  document.getElementById('qrLocation').textContent = session.location;
  document.getElementById('qrWindow').textContent = `${formatTime(session.startAt)} – ${formatTime(session.endAt)} · ${session.radius} m radius`;
  document.getElementById('qrToken').textContent = `${session.token.slice(0, 8)}…${session.token.slice(-6)}`;
  document.getElementById('qrTopic').textContent = session.topic || 'Regular lecture';
  document.getElementById('qrStatusLabel').textContent = session.status === 'finalized' ? 'ATTENDANCE FINALIZED' : session.status === 'closed' ? 'SESSION CLOSED' : 'CHECK-IN OPEN';
  const approved = STUDENTS.filter(student => student.courseIds.includes(session.courseId)).length;
  const present = checkinsFor(session.id).length;
  document.getElementById('approvedCount').textContent = String(approved);
  document.getElementById('liveCount').textContent = String(present);
  document.getElementById('qrProgressText').textContent = `${approved ? Math.round((present / approved) * 100) : 0}% attendance progress`;
  document.getElementById('qrProgressBar').style.width = `${approved ? Math.min(100, (present / approved) * 100) : 0}%`;
  document.getElementById('finalizeSessionBtn').disabled = session.status === 'finalized';
  document.getElementById('finalizeSessionBtn').textContent = session.status === 'finalized' ? 'Finalized' : 'Finalize';
  clearInterval(qrCountdownTimer);
  let secondsLeft = session.qrIssuedAt ? Math.max(0, QR_ROTATION_SECONDS - Math.floor((Date.now() - Date.parse(session.qrIssuedAt)) / 1000)) : QR_ROTATION_SECONDS;
  document.getElementById('qrCountdown').textContent = `${secondsLeft}s`;
  qrCountdownTimer = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      document.getElementById('qrStatusLabel').textContent = 'RENEWING QR CODE';
      document.getElementById('qrConnectionStatus').innerHTML = '<span class="live-indicator"></span><span>Renewing secure token…</span>';
      rotateSessionQr(true);
      return;
    }
    document.getElementById('qrCountdown').textContent = `${secondsLeft}s`;
  }, 1000);
  document.getElementById('closeSessionBtn').disabled = session.status === 'closed';
  document.getElementById('closeSessionBtn').textContent = session.status === 'closed' ? 'Session closed' : 'Close session';
  document.getElementById('qrCode').replaceChildren();
  const url = scanUrl(session.token);
  if (window.QRCode) {
    try {
      new window.QRCode(document.getElementById('qrCode'), { text: url, width: 192, height: 192, colorDark: '#17172b', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
    } catch (error) {
      console.error('Could not render session QR code:', error);
      document.getElementById('qrCode').textContent = 'QR unavailable. Copy the check-in link instead.';
    }
  } else {
    document.getElementById('qrCode').textContent = 'QR library unavailable. Copy the check-in link instead.';
  }
  openModal('qrModal');
}

let scanStream = null;
let scanFrameTimer = null;

async function toggleQrFullscreen() {
  const modal = document.querySelector('#qrModal .modal');
  if (!document.fullscreenElement) {
    try { await modal.requestFullscreen(); } catch (error) { showToast('Full-screen mode is not available in this browser.', 'error'); }
  } else {
    await document.exitFullscreen();
  }
}

async function startCameraScanner() {
  const video = document.getElementById('scanVideo');
  if (!navigator.mediaDevices?.getUserMedia) return failScan('Camera access is not available. Use the manual check-in link or ask your lecturer for help.');
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.srcObject = scanStream;
    await video.play();
    document.getElementById('cameraScanner').classList.remove('hidden');
    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const scanFrame = async () => {
        if (!scanStream) return;
        try {
          const codes = await detector.detect(video);
          const token = codes[0]?.rawValue?.match(/\/a\/([^/?#]+)/)?.[1] || codes[0]?.rawValue;
          if (token) { stopCameraScanner(); openScanModal(state.sessions.find(item => item.token === token), token); return; }
        } catch (error) { console.warn('Camera QR detection failed:', error); }
        scanFrameTimer = requestAnimationFrame(scanFrame);
      };
      scanFrameTimer = requestAnimationFrame(scanFrame);
    } else {
      showToast('Camera opened. This browser does not support automatic QR detection; use the link fallback.', 'error');
    }
  } catch (error) {
    console.warn('Camera permission failed:', error);
    failScan('Camera permission was denied or unavailable. Use the manual check-in link instead.');
  }
}

function stopCameraScanner() {
  if (scanFrameTimer) cancelAnimationFrame(scanFrameTimer);
  scanFrameTimer = null;
  if (scanStream) scanStream.getTracks().forEach(track => track.stop());
  scanStream = null;
  const video = document.getElementById('scanVideo');
  if (video) video.srcObject = null;
  document.getElementById('cameraScanner')?.classList.add('hidden');
}

function scanUrl(token) {
  if (location.protocol === 'file:') return `https://naub-attendance.example/a/${encodeURIComponent(token)}`;
  return `${location.origin}/a/${encodeURIComponent(token)}`;
}

async function copySessionUrl() {
  const session = state.sessions.find(item => item.id === activeSessionId);
  if (!session) return;
  const url = scanUrl(session.token);
  try {
    await navigator.clipboard.writeText(url);
    showToast('Check-in link copied.');
  } catch (error) {
    console.warn('Clipboard permission was not available:', error);
    window.prompt('Copy this check-in link:', url);
  }
}

function closeActiveSession() {
  const session = state.sessions.find(item => item.id === activeSessionId);
  if (!session || session.status === 'closed') return;
  if (!window.confirm('Close this class session now? New check-ins will no longer be accepted.')) return;
  if (isProduction()) {
    runRemote(() => window.NaubData.closeSession(session.id), 'Session closed. New check-ins are disabled.').then(() => closeModal('qrModal'));
    return;
  }
  session.status = 'closed';
  session.closedAt = new Date().toISOString();
  persist();
  closeModal('qrModal');
  renderAll();
  showToast('Session closed. New check-ins are disabled.');
}

function finalizeActiveSession() {
  const session = state.sessions.find(item => item.id === activeSessionId);
  if (!session || session.status === 'finalized') return;
  session.status = 'finalized';
  session.closedAt = new Date().toISOString();
  persist();
  openQrModal(session.id);
  renderAll();
  showToast('Attendance finalized. The register is now read-only.');
}

function rotateSessionQr(autoRotate = false) {
  const session = state.sessions.find(item => item.id === activeSessionId);
  if (!session || session.status === 'closed') {
    showToast('A closed session cannot receive a new QR code.', 'error');
    return;
  }
  if (isProduction()) {
    window.NaubData.rotateQr(session.id).then(token => {
      session.token = token;
      session.qrIssuedAt = new Date().toISOString();
      openQrModal(session.id);
      if (!autoRotate) showToast('QR code regenerated. The previous link no longer works.');
    }).catch(error => {
      console.error('QR rotation failed:', error);
      showToast(error.message || 'Could not issue a new QR code.', 'error');
    });
    return;
  }
  session.token = randomId() + randomId();
  session.qrIssuedAt = new Date().toISOString();
  persist();
  openQrModal(session.id);
  showToast('QR code regenerated. The previous link no longer works in this browser demo.');
}

function openRouteSession() {
  const match = location.pathname.match(/\/a\/([^/]+)\/?$/);
  const token = match ? match[1] : new URLSearchParams(location.search).get('scan');
  if (!token) return;
  if (document.body.classList.contains('auth-required')) {
    sessionStorage.setItem(PENDING_SCAN_KEY, token);
    openStudentPortal();
    setStudentAuthTab('register');
    setAuthFeedback('registerFeedback', 'Create your student account before checking in with this QR code.', false);
    return;
  }
  const session = state.sessions.find(item => item.token === token);
  openScanModal(session || null, token);
}

function resumePendingScan() {
  const token = sessionStorage.getItem(PENDING_SCAN_KEY);
  if (!token) return;
  sessionStorage.removeItem(PENDING_SCAN_KEY);
  const session = state.sessions.find(item => item.token === token);
  openScanModal(session || null, token);
}

function openScanModal(session, token) {
  const sessionToken = token || (session && session.token);
  const error = document.getElementById('scanError');
  error.classList.add('hidden');
  document.getElementById('scanFormWrap').classList.remove('hidden');
  document.getElementById('scanResult').classList.add('hidden');
  document.getElementById('locationStatus').className = 'location-status';
  document.getElementById('locationStatus').innerHTML = `${svgIcon('location', 'location-pin')}<div><strong>Location permission needed</strong><small>We’ll check your GPS accuracy before submitting.</small></div>`;
  document.getElementById('demoLocationBtn').dataset.token = sessionToken || '';
  document.getElementById('checkInBtn').dataset.token = sessionToken || '';
  if (isProduction()) {
    const course = session ? courseById(session.courseId) : null;
    document.getElementById('scanCourse').textContent = course ? `${course.code} · ${course.name}` : 'Class attendance check-in';
    document.getElementById('scanLocation').textContent = session?.location || 'Your location is verified by the server against the classroom.';
    document.getElementById('scanTime').textContent = session ? `Closes ${formatTime(session.endAt)} · ${session.radius} m check-in radius` : 'The server checks the session time window, enrolment and device.';
    document.getElementById('scanStudent').innerHTML = `<option value="${escapeHtml(currentDemoAccount.userId)}">${escapeHtml(currentDemoAccount.name)} · ${escapeHtml(currentDemoAccount.matricNumber || '')}</option>`;
    document.getElementById('scanStudent').disabled = true;
    document.getElementById('checkInBtn').disabled = currentDemoAccount.role !== 'student';
    document.getElementById('demoLocationBtn').disabled = true;
    document.getElementById('demoLocationBtn').classList.add('hidden');
    openModal('scanModal');
    return;
  }
  if (!session) {
    document.getElementById('scanCourse').textContent = 'Unknown or expired check-in link';
    document.getElementById('scanLocation').textContent = 'This QR code is not available in this browser demo.';
    document.getElementById('scanTime').textContent = 'Use a session created in this browser.';
  } else {
    const course = courseById(session.courseId);
    document.getElementById('scanCourse').textContent = `${course.code} · ${course.name}`;
    document.getElementById('scanLocation').textContent = session.location;
    document.getElementById('scanTime').textContent = `Closes ${formatTime(session.endAt)} · ${session.radius} m check-in radius`;
  }
  const options = STUDENTS.filter(student => session && student.courseIds.includes(session.courseId));
  document.getElementById('scanStudent').innerHTML = options.map(student => `<option value="${escapeHtml(student.id)}">${escapeHtml(student.name)} · ${escapeHtml(student.matric)}</option>`).join('');
  document.getElementById('scanStudent').disabled = options.length === 0;
  document.getElementById('checkInBtn').disabled = options.length === 0;
  document.getElementById('demoLocationBtn').disabled = options.length === 0;
  openModal('scanModal');
}

async function checkIn(useDemoLocation) {
  const token = document.getElementById('checkInBtn').dataset.token;
  const student = STUDENTS.find(item => item.id === document.getElementById('scanStudent').value);
  const error = document.getElementById('scanError');
  error.classList.add('hidden');

  if (isProduction()) return checkInRemote(token);
  const session = state.sessions.find(item => item.token === token);
  const validityMessage = validateSessionBeforeLocation(session);
  if (validityMessage) return failScan(validityMessage);
  if (!student) return failScan('We could not find a student account enrolled for this course.');

  let position;
  if (useDemoLocation) {
    position = { latitude: session.latitude, longitude: session.longitude, accuracy: 12 };
  } else {
    if (!navigator.geolocation) return failScan('Location is not available on this browser. Enable GPS or try another device.');
    setLocationStatus('Getting your location…', 'Please allow location access in your browser.', false);
    try {
      position = await getCurrentPosition();
    } catch (geoError) {
      console.warn('Browser location request failed:', geoError);
      const message = geoError.code === 1
        ? 'Location permission was denied. Allow location access in your browser, then try again.'
        : geoError.code === 3
          ? 'We could not get a location fix in time. Move near a window or outdoors and retry.'
          : 'We could not read your location. Check that GPS is turned on and retry.';
      return failScan(message);
    }
  }

  const resultMessage = validateCheckIn(session, student, position);
  if (resultMessage) return failScan(resultMessage);
  const alreadyRecorded = state.attendance.some(record => record.sessionId === session.id && record.studentId === student.id);
  if (alreadyRecorded) return failScan('You have already recorded attendance for this session. No duplicate record was created.');
  const recordedAt = new Date().toISOString();
  state.attendance.push({
    id: randomId(),
    sessionId: session.id,
    courseId: session.courseId,
    studentId: student.id,
    matricNumber: normalizeMatric(student.matric),
    attendanceDate: localDate(new Date(recordedAt)),
    status: 'PRESENT',
    checkedAt: recordedAt,
    signedInAt: recordedAt,
    signedOutAt: recordedAt,
    latitude: position.latitude,
    longitude: position.longitude,
    accuracy: position.accuracy,
    deviceId: deviceIdFor(student.id),
    demoLocation: useDemoLocation,
  });
  persist();
  renderAll();
  showScanResult(true, useDemoLocation
    ? 'Present — your attendance and both timestamps have been recorded successfully. This demo used a simulated classroom location; it is not an official attendance record.'
    : 'Present — your attendance and both timestamps have been recorded successfully.', student);
}

const CHECK_IN_REASONS = {
  authentication_required: 'Sign in with your student account, then scan again.',
  rate_limited: 'Too many check-in attempts. Wait a few minutes, then try again.',
  invalid_token: 'This QR code is invalid or has expired. Scan the latest code displayed by your lecturer.',
  session_closed: 'This attendance session is no longer accepting check-ins.',
  outside_time_window: 'This check-in is outside the session time window.',
  poor_gps_accuracy: 'Your GPS accuracy is too low. Move near a window or outdoors and retry.',
  outside_geofence: 'You appear to be outside the classroom check-in radius. Move closer and retry.',
  not_enrolled: 'You are not enrolled in this course. Contact your department if your enrolment is incorrect.',
  already_checked_in: 'You have already checked in for this class session.',
  device_not_approved: 'This device is not approved for your account. Your university must approve it before you can check in.',
};

async function checkInRemote(token) {
  if (!token) return failScan('This check-in link is missing its QR token. Scan the code again.');
  if (!navigator.geolocation) return failScan('Location is not available on this browser. Enable GPS or try another device.');
  setLocationStatus('Getting your location…', 'Please allow location access in your browser.', false);
  let position;
  try {
    position = await getCurrentPosition();
  } catch (geoError) {
    return failScan(geoError.code === 1
      ? 'Location permission was denied. Allow location access in your browser, then try again.'
      : 'We could not read your location. Check that GPS is turned on and retry.');
  }
  try {
    const result = await window.NaubData.markAttendance(token, deviceIdFor(currentDemoAccount.userId), position);
    if (!result?.ok) return failScan(CHECK_IN_REASONS[result?.reason] || 'Check-in was not accepted by the server.');
    await refreshRemoteData();
    const student = STUDENTS.find(item => item.id === currentDemoAccount.userId) || { name: currentDemoAccount.name, matric: currentDemoAccount.matricNumber || '' };
    showScanResult(true, `${String(result.status || 'present').replace(/^./, c => c.toUpperCase())} — your attendance has been recorded by the server.`, student);
  } catch (error) {
    console.error('Check-in request failed:', error);
    failScan('Check-in could not reach the server. Check your connection and retry.');
  }
}

function validateSessionBeforeLocation(session) {
  if (!session) return 'This QR code is invalid or does not belong to a session in this browser.';
  if (session.status === 'closed' || session.status === 'finalized') return 'This attendance session is no longer accepting check-ins.';
  if (session.qrIssuedAt && Date.now() - Date.parse(session.qrIssuedAt) > QR_ROTATION_SECONDS * 1000) return 'This QR code has expired. Scan the latest code displayed by your lecturer.';
  const now = Date.now();
  if (now < Date.parse(session.startAt) || now > Date.parse(session.endAt)) return 'This check-in is outside the session time window.';
  return '';
}

function validateCheckIn(session, student, position) {
  if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)
    || position.latitude < -90 || position.latitude > 90
    || position.longitude < -180 || position.longitude > 180
    || !Number.isFinite(position.accuracy) || position.accuracy <= 0) {
    return 'We could not read a reliable GPS position. Check that location is enabled, then retry.';
  }
  if (position.accuracy > MAX_GPS_ACCURACY_METRES) {
    return `Your GPS accuracy is about ${Math.round(position.accuracy)} m. We need an accuracy of 100 m or better. Move near a window or outdoors and retry.`;
  }
  const distance = distanceMetres(position.latitude, position.longitude, session.latitude, session.longitude);
  if (distance > session.radius) {
    return `You appear to be about ${Math.round(distance)} m from the classroom. The check-in radius is ${session.radius} m. Move closer and retry.`;
  }
  if (!student.courseIds.includes(session.courseId)) return 'You are not enrolled in this course. Contact your department if your enrolment is incorrect.';
  if (state.attendance.some(record => record.sessionId === session.id && record.studentId === student.id)) {
    return 'You have already checked in for this class session.';
  }
  if (!deviceIdFor(student.id)) return 'This device is not registered to your student account. Request a device change from your university.';
  return '';
}

function deviceIdFor(studentId) {
  try {
    const key = `naub-attendance-demo-device-${studentId}`;
    let id = localStorage.getItem(key);
    if (!id) {
      id = randomId();
      localStorage.setItem(key, id);
    }
    return id;
  } catch (error) {
    console.error('Could not access the demo device identifier:', error);
    return '';
  }
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      reject,
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  });
}

function distanceMetres(lat1, lon1, lat2, lon2) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function setLocationStatus(title, description, success) {
  const element = document.getElementById('locationStatus');
  element.className = success ? 'location-status success' : 'location-status';
  element.innerHTML = `${svgIcon('location', 'location-pin')}<div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></div>`;
}

function failScan(message) {
  const error = document.getElementById('scanError');
  error.textContent = message;
  error.classList.remove('hidden');
  setLocationStatus('Check-in could not be completed', message, false);
}

function showScanResult(success, message, student) {
  document.getElementById('scanFormWrap').classList.add('hidden');
  const result = document.getElementById('scanResult');
  result.className = success ? 'scan-result' : 'scan-result failure';
  result.innerHTML = `<div class="result-mark">${success ? svgIcon('check', 'ui-icon') : svgIcon('info', 'ui-icon')}</div><span class="result-status">${success ? 'PRESENT' : 'CHECK-IN NOT COMPLETE'}</span><h3>${success ? `You’re checked in, ${escapeHtml(student.name.split(' ')[0])}!` : 'Not checked in'}</h3><p>${escapeHtml(message)}</p><button class="button button-outline" id="scanDoneBtn">Done</button>`;
  document.getElementById('scanDoneBtn').addEventListener('click', () => closeModal('scanModal'));
}

function bindExports() {
  document.getElementById('exportStudents').addEventListener('click', () => exportCsv('naub-students.csv', studentRows()));
  document.getElementById('exportReport').addEventListener('click', () => exportCsv('naub-attendance-report.csv', reportRows()));
}

function studentRows() {
  return [['Name', 'Matric number', 'Course', 'Attendance (%)', 'Status'], ...STUDENTS.flatMap(student => student.courseIds.map(courseId => {
    const course = courseById(courseId);
    return [student.name, student.matric, `${course.code} ${course.name}`, student.rate, student.rate < THRESHOLD ? 'At risk' : 'On track'];
  }))];
}

function reportRows() {
  return [['Name', 'Matric number', 'Course', 'Attendance (%)', 'Sessions attended'], ...STUDENTS.filter(student => student.rate < THRESHOLD).flatMap(student => student.courseIds.filter(courseId => {
    const selectedCourse = document.getElementById('reportCourse').value;
    return !selectedCourse || selectedCourse === courseId;
  }).map(courseId => [student.name, student.matric, courseById(courseId).code, student.rate, student.attended]))];
}

function exportCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  showToast('Your CSV report has been downloaded.');
}

function csvCell(value) {
  const safe = String(value ?? '').replaceAll('"', '""');
  return `"${safe}"`;
}

function bindTheme() {
  let theme = 'light';
  try {
    theme = localStorage.getItem('naub-attendance-theme') || 'light';
  } catch (error) {
    console.warn('Could not read the theme preference:', error);
  }
  document.documentElement.dataset.theme = theme;
  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('naub-attendance-theme', next);
    } catch (error) {
      console.warn('Could not save the theme preference:', error);
    }
  });
}

function bindUtilityControls() {
  document.getElementById('dismissBanner').addEventListener('click', () => {
    document.querySelector('.demo-banner').classList.add('hidden');
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-contact-message]');
    if (!button) return;
    openContactModal(button.dataset.contactMessage);
  });
  document.getElementById('contactForm').addEventListener('submit', event => {
    event.preventDefault();
    const recipient = findContact(document.getElementById('contactRecipientId').value);
    const message = document.getElementById('contactMessage').value.trim();
    if (!recipient || !message) {
      formError(document.getElementById('contactError'), 'Enter a message before sending.');
      return;
    }
    state.messages.push({ id: randomId(), from: currentDemoAccount?.name || 'Demo user', recipientId: recipient.id, message, createdAt: new Date().toISOString() });
    persist();
    closeModal('contactModal');
    showToast(`Message prepared for ${recipient.name}.`);
  });
}

function renderWorkflowPages() {
  const lecturerBody = document.getElementById('lecturerTableBody');
  if (lecturerBody) lecturerBody.innerHTML = LECTURERS.map(lecturer => `<tr><td><strong>${escapeHtml(lecturer.name)}</strong><small class="table-subtext">${escapeHtml(lecturer.email)}</small></td><td>${escapeHtml(lecturer.staffId)}</td><td>${escapeHtml(lecturer.department)}</td><td>${lecturer.courseIds.length}</td><td><span class="table-status ${lecturer.status === 'active' ? '' : 'at-risk'}">${escapeHtml(lecturer.status)}</span></td><td><button class="button button-small button-soft" data-lecturer-action="${lecturer.id}">${lecturer.status === 'pending' ? 'Approve' : 'View'}</button></td></tr>`).join('');
  const courseBody = document.getElementById('adminCourseTableBody');
  if (courseBody) courseBody.innerHTML = COURSES.map(course => `<tr><td><strong>${escapeHtml(course.code)}</strong><small class="table-subtext">${escapeHtml(course.name)}</small></td><td>Computer Science</td><td>300</td><td>First Semester</td><td>${course.id === 'csc301' ? 'Dr. Amina Yusuf' : 'Unassigned'}</td><td>${course.students}</td></tr>`).join('');
  const pendingLecturers = document.getElementById('pendingLecturerApprovals');
  if (pendingLecturers) pendingLecturers.innerHTML = LECTURERS.filter(item => item.approval === 'pending').map(item => `<div class="approval-item"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.staffId)} · ${escapeHtml(item.department)}</span></div><button class="button button-small button-primary" data-approve-lecturer="${item.id}">Approve</button></div>`).join('') || '<div class="empty-state">No pending lecturer applications.</div>';
  const pendingStudents = document.getElementById('pendingStudentApprovals');
  if (pendingStudents) pendingStudents.innerHTML = ENROLMENT_REQUESTS.filter(item => item.status === 'pending').map(item => { const student = STUDENTS.find(s => s.id === item.studentId); const course = COURSES.find(c => c.id === item.courseId); return `<div class="approval-item"><div><strong>${escapeHtml(student.name)}</strong><span>${escapeHtml(course.code)} · ${escapeHtml(student.matric)}</span></div><span class="table-status at-risk">Pending</span></div>`; }).join('') || '<div class="empty-state">No pending student enrolments.</div>';
  const studentApprovals = document.getElementById('studentApprovalTableBody');
  if (studentApprovals) studentApprovals.innerHTML = ENROLMENT_REQUESTS.filter(item => item.status === 'pending').map(item => { const student = STUDENTS.find(s => s.id === item.studentId); const course = COURSES.find(c => c.id === item.courseId); return `<tr><td>${escapeHtml(student.name)}</td><td>${escapeHtml(student.matric)}</td><td>${escapeHtml(course.code)} · ${escapeHtml(course.name)}</td><td><span class="table-status">Awaiting verification</span></td><td><button class="button button-small button-primary" data-approve-enrolment="${item.id}">Approve</button><button class="button button-small button-outline" data-reject-enrolment="${item.id}">Reject</button></td></tr>`; }).join('');
  const status = document.getElementById('registrationStatusContent');
  if (status) status.innerHTML = `<div class="registration-summary"><span class="status-pill upcoming"><i></i> Awaiting approval</span><h2>Registration submitted</h2><p>Your account is awaiting identity verification. Course decisions are tracked independently.</p></div>${ENROLMENT_REQUESTS.map(item => { const course = COURSES.find(c => c.id === item.courseId); return `<div class="status-row"><div><strong>${escapeHtml(course.code)} · ${escapeHtml(course.name)}</strong><small>${item.status === 'rejected' ? escapeHtml(item.reason) : 'Lecturer approval is pending.'}</small></div><span class="table-status ${item.status === 'approved' ? '' : 'at-risk'}">${escapeHtml(item.status)}</span></div>`; }).join('')}`;
  document.querySelectorAll('[data-approve-lecturer]').forEach(button => button.onclick = () => { const lecturer = LECTURERS.find(item => item.id === button.dataset.approveLecturer); lecturer.status = 'active'; lecturer.approval = 'approved'; renderWorkflowPages(); showToast('Lecturer approved and activated.'); });
  document.querySelectorAll('[data-approve-enrolment]').forEach(button => button.onclick = () => { const request = ENROLMENT_REQUESTS.find(item => item.id === button.dataset.approveEnrolment); request.status = 'approved'; renderWorkflowPages(); showToast('Course enrolment approved.'); });
  document.querySelectorAll('[data-reject-enrolment]').forEach(button => button.onclick = () => { const request = ENROLMENT_REQUESTS.find(item => item.id === button.dataset.rejectEnrolment); request.status = 'rejected'; request.reason = 'Rejected by lecturer; correction required.'; renderWorkflowPages(); showToast('Enrolment rejected with a correction reason.', 'error'); });
  document.getElementById('inviteLecturerBtn')?.addEventListener('click', () => showToast('Invitation created with a secure, expiring token. Connect the invitation endpoint to persist it.', 'success'));
  document.getElementById('createCourseBtn')?.addEventListener('click', () => showToast('Course creation form is ready for the course-management API.'));
}

function renderAll() {
  renderTodayClasses();
  renderSessions();
  renderStudents();
  renderReport();
  renderCourseAttendance();
  renderStats();
  renderLecturerSchedules();
  const lecturerContacts = document.getElementById('lecturerContacts');
  if (lecturerContacts) lecturerContacts.innerHTML = `${renderContactPanel('lecturer').replace(/^<section class="panel contact-panel">|<\/section>$/g, '')}`;
}

function renderStats() {
  document.getElementById('totalStudents').textContent = String(STUDENTS.length);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const thisWeek = state.sessions.filter(session => Date.parse(session.startAt) >= weekStart.getTime()).length;
  document.getElementById('sessionsThisWeek').textContent = String(thisWeek);
  const average = Math.round(COURSES.reduce((sum, course) => sum + course.rate, 0) / COURSES.length);
  document.getElementById('averageAttendance').innerHTML = `${average}<span class="value-percent">%</span>`;
  const atRisk = STUDENTS.filter(student => student.rate < THRESHOLD).length;
  document.getElementById('atRiskCount').textContent = String(atRisk);
  document.querySelector('.threshold-chip').textContent = `${atRisk} students at risk`;
}

function renderTodayClasses() {
  const container = document.getElementById('todayClasses');
  const today = localDate(new Date());
  const sessions = state.sessions
    .filter(session => session.date === today)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  if (!sessions.length) {
    container.innerHTML = '<div class="panel empty-state"><strong>No classes scheduled today</strong>Create a session to get started.</div>';
    return;
  }
  container.innerHTML = sessions.map(session => {
    const course = courseById(session.courseId);
    const status = getSessionStatus(session);
    const count = checkinsFor(session.id).length;
    return `<article class="class-card"><div class="course-monogram ${course.tint}">${escapeHtml(course.code.split(' ').map(part => part[0]).join(''))}</div><div class="class-course"><strong>${escapeHtml(course.code)} · ${escapeHtml(course.name)}</strong><small>${course.students} students enrolled</small></div><div class="class-time"><strong>${formatTime(session.startAt)} – ${formatTime(session.endAt)}</strong><small>${status === 'open' ? 'Today · In progress' : escapeHtml(formatDate(session.date))}</small></div><div class="class-place"><strong>${escapeHtml(session.location)}</strong><small>${svgIcon('location', 'inline-icon')} ${session.radius} m check-in radius</small></div><div class="attendance-count"><strong>${count}</strong> / ${course.students} checked in</div><div class="class-action">${status === 'open' ? `<button class="button button-small button-soft" data-open-qr="${escapeHtml(session.id)}">View QR code</button>` : `<span class="status-pill ${status}"><i></i>${statusLabel(status)}</span>`}</div></article>`;
  }).join('');
  container.querySelectorAll('[data-open-qr]').forEach(button => button.addEventListener('click', () => openQrModal(button.dataset.openQr)));
}

function renderSessions() {
  const container = document.getElementById('sessionList');
  const sessions = [...state.sessions].sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt)).filter(session => sessionFilter === 'all' || getSessionStatus(session) === sessionFilter);
  if (!sessions.length) {
    container.innerHTML = '<div class="panel empty-state"><strong>No sessions found</strong>Try another filter or create a class session.</div>';
    return;
  }
  container.innerHTML = sessions.map(session => {
    const course = courseById(session.courseId);
    const status = getSessionStatus(session);
    const count = checkinsFor(session.id).length;
    const date = new Date(`${session.date}T12:00:00`);
    const action = status !== 'ended'
      ? `<button class="button button-small button-soft" data-open-qr="${escapeHtml(session.id)}">View QR</button><button class="button button-small button-outline" data-edit-session="${escapeHtml(session.id)}">Edit</button><button class="button button-small button-outline" data-scan="${escapeHtml(session.id)}">Test scan</button>`
      : `<span class="status-pill ${status}"><i></i>${statusLabel(status)}</span>`;
    return `<article class="session-row"><div class="session-date"><strong>${date.getDate()}</strong><small>${date.toLocaleDateString('en-NG', { month: 'short' })}</small></div><div class="session-info"><strong>${escapeHtml(course.code)} · ${escapeHtml(course.name)}</strong><small>${escapeHtml(session.location)} · ${session.radius} m</small></div><div class="session-detail"><strong>${formatTime(session.startAt)} – ${formatTime(session.endAt)}</strong><small>${escapeHtml(formatDate(session.date))}</small></div><div class="session-detail"><strong>${count} checked in</strong><small>${course.students} students enrolled</small></div><div class="session-actions">${action}</div></article>`;
  }).join('');
  container.querySelectorAll('[data-open-qr]').forEach(button => button.addEventListener('click', () => openQrModal(button.dataset.openQr)));
  container.querySelectorAll('[data-scan]').forEach(button => button.addEventListener('click', () => {
    const session = state.sessions.find(item => item.id === button.dataset.scan);
    openScanModal(session);
  }));
  container.querySelectorAll('[data-edit-session]').forEach(button => button.addEventListener('click', () => openSessionForm(button.dataset.editSession)));
}

function renderStudents() {
  const selectedCourse = document.getElementById('rosterCourse').value;
  const query = document.getElementById('studentSearch').value.trim().toLowerCase();
  const filtered = STUDENTS.flatMap(student => student.courseIds.filter(courseId => !selectedCourse || selectedCourse === courseId).map(courseId => ({ student, course: courseById(courseId) })))
    .filter(({ student, course }) => `${student.name} ${student.matric} ${course.code} ${course.name}`.toLowerCase().includes(query));
  document.getElementById('rosterCount').textContent = `${filtered.length} enrolments`;
  document.getElementById('studentTableBody').innerHTML = filtered.map(({ student, course }) => {
    const initials = student.name.split(' ').slice(0, 2).map(part => part[0]).join('');
    const risk = student.rate < THRESHOLD;
    return `<tr><td><span class="student-cell"><span class="student-avatar">${escapeHtml(initials)}</span>${escapeHtml(student.name)}</span></td><td>${escapeHtml(student.matric)}</td><td>${escapeHtml(course.code)}</td><td><span class="attendance-meter"><i class="${risk ? 'low' : ''}" style="width:${student.rate}%"></i></span>${student.rate}%</td><td><span class="table-status ${risk ? 'at-risk' : ''}">${risk ? 'At risk' : 'On track'}</span></td></tr>`;
  }).join('');
}

function renderReport() {
  const selectedCourse = document.getElementById('reportCourse').value;
  const rows = STUDENTS.flatMap(student => student.courseIds.filter(courseId => {
    return student.rate < THRESHOLD && (!selectedCourse || selectedCourse === courseId);
  }).map(courseId => ({ student, course: courseById(courseId) })));
  document.getElementById('reportTableBody').innerHTML = rows.map(({ student, course }) => `<tr><td>${escapeHtml(student.name)}</td><td>${escapeHtml(student.matric)}</td><td>${escapeHtml(course.code)}</td><td><span class="attendance-meter"><i class="low" style="width:${student.rate}%"></i></span>${student.rate}%</td><td>${student.attended} / 12 sessions</td></tr>`).join('');
  document.getElementById('noAtRisk').classList.toggle('hidden', rows.length > 0);
  const studentsAtRisk = new Set(rows.map(({ student }) => student.id)).size;
  document.querySelector('.threshold-chip').textContent = `${studentsAtRisk} students at risk`;
}

function renderCourseAttendance() {
  const container = document.getElementById('courseAttendanceList');
  container.innerHTML = COURSES.map(course => `<div class="course-rate-row"><span class="course-rate-name">${escapeHtml(course.code)} · ${escapeHtml(course.name)}</span><span class="course-rate-value">${course.rate}%</span><div class="progress-track"><div class="progress-fill ${course.rate < THRESHOLD ? 'warn' : ''}" style="width:${course.rate}%"></div></div></div>`).join('');
}

function checkinsFor(sessionId) {
  return state.attendance.filter(record => record.sessionId === sessionId);
}

function courseById(courseId) {
  return COURSES.find(course => course.id === courseId) || COURSES[0];
}

function getSessionStatus(session) {
  if (session.status === 'closed') return 'ended';
  const now = Date.now();
  if (now < Date.parse(session.startAt)) return 'upcoming';
  if (now > Date.parse(session.endAt)) return 'ended';
  return 'open';
}

function statusLabel(status) {
  return { open: 'Open now', upcoming: 'Upcoming', ended: 'Ended' }[status] || status;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
}

function setTodayLabel() {
  const now = new Date();
  const label = now.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('todayLabel').textContent = label.toUpperCase();
  document.getElementById('todayClassesSubline').textContent = `Your sessions for ${now.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}`;
}

function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('hidden');
  if (id === 'studentAuthModal') {
    modal.scrollTop = 0;
    modal.parentElement.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (id === 'studentAuthModal') {
    clearStudentAuthForms();
    if (document.body.classList.contains('auth-required')) {
      openStudentPortal();
      return;
    }
  }
  modal.classList.add('hidden');
  if (!document.querySelector('.modal-backdrop:not(.hidden)')) document.body.style.overflow = '';
}

function clearStudentAuthForms() {
  document.getElementById('studentLoginPanel').reset();
  document.getElementById('studentRegisterPanel').reset();
  document.getElementById('lecturerLoginPanel').reset();
  document.getElementById('adminLoginPanel').reset();
  document.getElementById('registerPhone').setCustomValidity('');
  setAuthFeedback('loginFeedback', '', false);
  setAuthFeedback('registerFeedback', '', false);
  setAuthFeedback('lecturerFeedback', '', false);
  setAuthFeedback('adminFeedback', '', false);
}

function formError(element, message) {
  element.textContent = message;
  element.classList.remove('hidden');
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}
