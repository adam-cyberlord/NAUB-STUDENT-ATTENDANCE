'use strict';

const STORAGE_KEY = 'naub-attendance-demo-v1';
const THRESHOLD = 75;
const MAX_GPS_ACCURACY_METRES = 100;
const COURSES = [
  { id: 'csc301', code: 'CSC 301', name: 'Data Structures & Algorithms', students: 48, rate: 87, tint: 'purple', room: 'Main Lecture Theatre' },
  { id: 'csc305', code: 'CSC 305', name: 'Database Management Systems', students: 36, rate: 76, tint: 'blue', room: 'Computer Science Lab' },
  { id: 'csc311', code: 'CSC 311', name: 'Operating Systems', students: 28, rate: 91, tint: 'amber', room: 'Lecture Hall B' },
  { id: 'gst201', code: 'GST 201', name: 'Entrepreneurship Studies', students: 16, rate: 68, tint: 'purple', room: 'Main Classroom' },
];
const LECTURERS = [
  { id: 'l1', name: 'Dr. Amina Yusuf', staffId: 'NAUB-CS-014', email: 'amina.yusuf@naub.edu.ng', department: 'Computer Science', courseIds: ['csc301', 'csc305'], status: 'active', approval: 'approved' },
  { id: 'l2', name: 'Dr. Musa Bello', staffId: 'NAUB-CS-027', email: 'musa.bello@naub.edu.ng', department: 'Computer Science', courseIds: ['csc311'], status: 'pending', approval: 'pending' },
  { id: 'l3', name: 'Engr. N. Ibrahim', staffId: 'NAUB-EEE-008', email: 'n.ibrahim@naub.edu.ng', department: 'Electrical Engineering', courseIds: [], status: 'suspended', approval: 'approved' },
];
const ENROLMENT_REQUESTS = [
  { id: 'en1', studentId: 'u3', courseId: 'csc301', status: 'pending', reason: '' },
  { id: 'en2', studentId: 'u5', courseId: 'csc305', status: 'pending', reason: '' },
  { id: 'en3', studentId: 'u7', courseId: 'gst201', status: 'rejected', reason: 'Please confirm your department details.' },
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
let activeSessionId = null;
let editingSessionId = null;
let sessionFilter = 'all';
let toastTimer;
let supabaseClientPromise;
let isAuthenticated = false;
let qrCountdownTimer = null;
const QR_ROTATION_SECONDS = 30;

document.addEventListener('DOMContentLoaded', init);

function init() {
  state = loadState();
  seedState();
  bindNavigation();
  bindSessionForm();
  bindScanFlow();
  bindExports();
  bindTheme();
  bindUtilityControls();
  bindRoleSwitcher();
  bindStudentAuth();
  populateCourseSelects();
  renderAll();
  renderWorkflowPages();
  setTodayLabel();
  setSessionDefaults();
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
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    isAuthenticated = Boolean(data.session);
  } catch (error) {
    console.error('Unable to initialize student authentication:', error);
  }
  if (!isAuthenticated) openStudentPortal();
}

function matricEmail(matric) {
  return `${matric.trim().toLowerCase().replace(/[^a-z0-9]/g, '')}@students.naub.edu.ng`;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { sessions: [], attendance: [] };
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.attendance)) {
      throw new Error('Stored demo data has an unexpected shape.');
    }
    return parsed;
  } catch (error) {
    console.error('Unable to load NAUB attendance demo data:', error);
    return { sessions: [], attendance: [] };
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Unable to save NAUB attendance demo data:', error);
    showToast('Could not save this change in your browser. Check available storage.', 'error');
  }
}

function seedState() {
  if (state.sessions.length) return;
  const now = new Date();
  const activeStart = new Date(now.getTime() - 15 * 60_000);
  const activeEnd = new Date(now.getTime() + 45 * 60_000);
  state.sessions = [
    makeSeedSession('csc301', activeStart, activeEnd, 'NAUB Main Campus, Biu'),
    makeSeedSession('csc305', atTime(now, 13, 30), atTime(now, 14, 30), 'Computer Science Lab'),
    makeSeedSession('csc311', atTime(now, 9, 0), atTime(now, 10, 0), 'Lecture Hall B'),
  ];
  persist();
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
    document.getElementById('sidebar').classList.toggle('mobile-open');
  });
  document.getElementById('createSessionBtn').addEventListener('click', () => openSessionForm());
  document.getElementById('createSessionBtn2').addEventListener('click', () => openSessionForm());
  document.getElementById('studentPortalBtn').addEventListener('click', openStudentPortal);
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

function bindStudentAuth() {
  document.getElementById('loginTab').addEventListener('click', () => setStudentAuthTab('login'));
  document.getElementById('registerTab').addEventListener('click', () => setStudentAuthTab('register'));
  document.querySelectorAll('[data-auth-tab]').forEach(button => {
    button.addEventListener('click', () => setStudentAuthTab(button.dataset.authTab));
  });
  document.getElementById('forgotPasswordBtn').addEventListener('click', () => {
    setAuthFeedback('loginFeedback', 'Password reset is not available in this preview. In production, use the university account recovery service.', true);
  });
  document.getElementById('studentLoginPanel').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const matric = document.getElementById('loginMatric').value.trim();
    const password = document.getElementById('loginPassword').value;
    setAuthFeedback('loginFeedback', 'Signing you in…', false);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email: matricEmail(matric), password });
      if (error) throw error;
      isAuthenticated = true;
      closeModal('studentAuthModal');
      setAuthFeedback('loginFeedback', '', false);
    } catch (error) {
      console.error('Student sign-in failed:', error);
      setAuthFeedback('loginFeedback', 'Invalid matric number or password.', true);
    } finally {
      document.getElementById('loginPassword').value = '';
    }
  });
  const registerForm = document.getElementById('studentRegisterPanel');
  const confirmPassword = document.getElementById('registerPasswordConfirm');
  const phoneInput = document.getElementById('registerPhone');
  const checkPhone = () => {
    const digits = phoneInput.value.replace(/\D/g, '');
    phoneInput.setCustomValidity(digits.length < 10 || digits.length > 15 ? 'Enter a phone number with 10 to 15 digits.' : '');
  };
  phoneInput.addEventListener('input', checkPhone);
  const checkPasswordMatch = () => {
    const matches = document.getElementById('registerPassword').value === confirmPassword.value;
    confirmPassword.setCustomValidity(matches ? '' : 'Passwords do not match.');
  };
  document.getElementById('registerPassword').addEventListener('input', checkPasswordMatch);
  confirmPassword.addEventListener('input', checkPasswordMatch);
  registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    checkPhone();
    checkPasswordMatch();
    if (!registerForm.reportValidity()) return;
    const matric = document.getElementById('registerMatric').value.trim();
    const password = document.getElementById('registerPassword').value;
    setAuthFeedback('registerFeedback', 'Creating your account…', false);
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.signUp({
        email: matricEmail(matric),
        password,
        options: {
          data: {
            full_name: document.getElementById('registerName').value.trim(),
            matric_number: matric,
            phone: document.getElementById('registerPhone').value.trim(),
            faculty: document.getElementById('registerFaculty').value.trim(),
            department: document.getElementById('registerDepartment').value.trim(),
            level: document.getElementById('registerLevel').value,
          },
          emailRedirectTo: window.location.href.split('#')[0],
        },
      });
      if (error) throw error;
      if (data.session) {
        isAuthenticated = true;
        closeModal('studentAuthModal');
      } else {
        setAuthFeedback('registerFeedback', 'Account created. Check your university email to confirm, then sign in.', false);
      }
      registerForm.reset();
    } catch (error) {
      console.error('Student registration failed:', error);
      setAuthFeedback('registerFeedback', 'We could not create that account. Check the details and try again.', true);
    } finally {
      document.getElementById('registerPassword').value = '';
      confirmPassword.value = '';
    }
  });
}

function openStudentPortal() {
  setStudentAuthTab('login');
  setAuthFeedback('loginFeedback', '', false);
  setAuthFeedback('registerFeedback', '', false);
  openModal('studentAuthModal');
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

function setAuthFeedback(id, message, isError) {
  const feedback = document.getElementById(id);
  feedback.textContent = message;
  feedback.classList.toggle('hidden', !message);
  feedback.classList.toggle('error', isError);
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
  const title = { dashboard: 'Overview', admin: 'Admin overview', student: 'Student overview', sessions: 'Class sessions', students: 'My students', reports: 'Attendance reports', lecturers: 'Lecturer management', courses: 'Course management', approvals: 'Approval center', 'student-approvals': 'Student approvals', 'registration-status': 'Registration status' }[page];
  if (!title) return;
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  document.querySelectorAll('.page').forEach(section => section.classList.toggle('active', section.id === `page-${page}`));
  document.getElementById('pageCrumb').textContent = title;
  document.getElementById('sidebar').classList.remove('mobile-open');
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
    document.getElementById('sessionLocation').value = 'NAUB Main Campus, Biu';
    document.getElementById('sessionLat').value = '10.61';
    document.getElementById('sessionLng').value = '12.19';
    document.getElementById('sessionRadius').value = 50;
  }
  document.getElementById('modalTitle').textContent = session ? 'Edit class session' : 'Set up your class';
  document.querySelector('#sessionForm button[type="submit"]').innerHTML = session ? 'Save changes <span>→</span>' : 'Create session <span>→</span>';
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
  document.getElementById('locationStatus').innerHTML = '<span class="location-pin">⌖</span><div><strong>Location permission needed</strong><small>We’ll check your GPS accuracy before submitting.</small></div>';
  document.getElementById('demoLocationBtn').dataset.token = sessionToken || '';
  document.getElementById('checkInBtn').dataset.token = sessionToken || '';
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
  state.attendance.push({
    id: randomId(),
    sessionId: session.id,
    courseId: session.courseId,
    studentId: student.id,
    status: 'PRESENT',
    checkedAt: new Date().toISOString(),
    latitude: position.latitude,
    longitude: position.longitude,
    accuracy: position.accuracy,
    deviceId: deviceIdFor(student.id),
    demoLocation: useDemoLocation,
  });
  persist();
  renderAll();
  showScanResult(true, useDemoLocation
    ? 'Attendance marked present. This demo used a simulated classroom location; it is not an official attendance record.'
    : 'Your attendance has been marked present for this class.', student);
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
  element.innerHTML = `<span class="location-pin">⌖</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></div>`;
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
  result.innerHTML = `<div class="result-mark">${success ? '✓' : '!'}</div><span class="result-status">${success ? 'PRESENT' : 'CHECK-IN NOT COMPLETE'}</span><h3>${success ? `You’re checked in, ${escapeHtml(student.name.split(' ')[0])}!` : 'Not checked in'}</h3><p>${escapeHtml(message)}</p><button class="button button-outline" id="scanDoneBtn">Done</button>`;
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
    return `<article class="class-card"><div class="course-monogram ${course.tint}">${escapeHtml(course.code.split(' ').map(part => part[0]).join(''))}</div><div class="class-course"><strong>${escapeHtml(course.code)} · ${escapeHtml(course.name)}</strong><small>${course.students} students enrolled</small></div><div class="class-time"><strong>${formatTime(session.startAt)} – ${formatTime(session.endAt)}</strong><small>${status === 'open' ? 'Today · In progress' : escapeHtml(formatDate(session.date))}</small></div><div class="class-place"><strong>${escapeHtml(session.location)}</strong><small>⌖ ${session.radius} m check-in radius</small></div><div class="attendance-count"><strong>${count}</strong> / ${course.students} checked in</div><div class="class-action">${status === 'open' ? `<button class="button button-small button-soft" data-open-qr="${escapeHtml(session.id)}">View QR code</button>` : `<span class="status-pill ${status}"><i></i>${statusLabel(status)}</span>`}</div></article>`;
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
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (id === 'studentAuthModal' && !isAuthenticated) return;
  if (id === 'studentAuthModal') clearStudentAuthForms();
  modal.classList.add('hidden');
  if (!document.querySelector('.modal-backdrop:not(.hidden)')) document.body.style.overflow = '';
}

function clearStudentAuthForms() {
  document.getElementById('studentLoginPanel').reset();
  document.getElementById('studentRegisterPanel').reset();
  document.getElementById('registerPhone').setCustomValidity('');
  document.getElementById('registerPasswordConfirm').setCustomValidity('');
  setAuthFeedback('loginFeedback', '', false);
  setAuthFeedback('registerFeedback', '', false);
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
