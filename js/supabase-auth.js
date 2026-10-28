'use strict';

(function () {
  let clientPromise = null;

  async function getClient() {
    if (!clientPromise) {
      clientPromise = fetch('/api/auth-config', { headers: { Accept: 'application/json' } })
        .then(response => {
          if (!response.ok) throw new Error('Supabase configuration is unavailable.');
          return response.json();
        })
        .then(config => {
          if (!config.url || !config.publishableKey || !window.supabase?.createClient) {
            throw new Error('Supabase authentication is not configured.');
          }
          return window.supabase.createClient(config.url, config.publishableKey, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
          });
        });
    }
    return clientPromise;
  }

  function authError(error, fallback = 'unexpected_error') {
    const message = String(error?.message || error || '').toLowerCase();
    if (message.includes('email not confirmed') || message.includes('confirm')) return 'email_not_confirmed';
    if (message.includes('password') && message.includes('weak')) return 'weak_password';
    if (message.includes('rate') || error?.status === 429) return 'rate_limited';
    if (message.includes('invalid login') || message.includes('invalid credentials')) return 'invalid_credentials';
    return fallback;
  }

  window.NaubAuth = {
    client: getClient,
    enabled: () => Boolean(window.supabase?.createClient),
    signInStudent: async (matricNumber, password) => {
      const client = await getClient();
      const { data, error } = await client.functions.invoke('student-login', {
        body: { matric_number: matricNumber, password },
      });
      if (error || !data?.session) throw new Error(authError(error || data?.error, 'invalid_credentials'));
      await client.auth.setSession(data.session);
      return window.NaubAuth.profile();
    },
    signInPassword: async (email, password) => {
      const client = await getClient();
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(authError(error, 'invalid_credentials'));
      return window.NaubAuth.profile();
    },
    registerStudent: async details => {
      const client = await getClient();
      const { data, error } = await client.functions.invoke('student-register', {
        body: {
          full_name: details.fullName,
          matric_number: details.matricNumber,
          email: details.email,
          password: details.password,
          phone: details.phone,
          faculty: details.faculty,
          department: details.department,
          level: details.level,
          academic_session: details.academicSession,
          university_slug: 'naub',
        },
      });
      if (error || !data?.ok) throw new Error(authError(error || data?.error, 'registration_failed'));
      return data;
    },
    markPresent: async sessionId => {
      const client = await getClient();
      const { data, error } = await client.rpc('mark_present', { p_session_id: sessionId });
      if (error) throw error;
      return data;
    },
    signOutAttendance: async sessionId => {
      const client = await getClient();
      const { data, error } = await client.rpc('sign_out_attendance', { p_session_id: sessionId });
      if (error) throw error;
      return data;
    },
    checkInLecturer: async scheduleId => {
      const client = await getClient();
      const { data, error } = await client.rpc('check_in_lecturer', { p_schedule_id: scheduleId });
      if (error) throw error;
      return data;
    },
    resetPassword: async email => {
      const client = await getClient();
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      });
      if (error) throw new Error(authError(error));
    },
    profile: async () => {
      const client = await getClient();
      const { data, error } = await client.rpc('current_user_profile');
      if (error || !data?.id || data.account_status !== 'active') throw new Error('account_not_active');
      const roles = Array.isArray(data.roles) ? data.roles : [];
      const role = roles.includes('super_admin') || roles.includes('university_admin')
        ? 'admin' : roles.includes('lecturer') ? 'lecturer' : 'student';
      return { role, name: data.full_name, matricNumber: data.matric_number, staffId: data.staff_id, userId: data.id, universityId: data.university_id, production: true };
    },
    restore: async () => {
      const client = await getClient();
      const { data } = await client.auth.getSession();
      if (!data.session) return null;
      return window.NaubAuth.profile();
    },
    signOut: async () => {
      const client = await getClient();
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
  };
})();
