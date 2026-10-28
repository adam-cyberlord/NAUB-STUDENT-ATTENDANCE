'use strict';

(function () {
  const config = window.NAUB_SUPABASE_CONFIG;
  const clientFactory = window.supabase?.createClient;
  let client = null;

  if (config?.url && config?.publishableKey && clientFactory) {
    client = clientFactory(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  window.NaubAuth = {
    enabled: () => Boolean(client),
    signInStudent: async (matricNumber, password) => {
      if (!client) throw new Error('Supabase authentication is not configured.');
      const { data, error } = await client.functions.invoke('student-login', {
        body: { matric_number: matricNumber, password },
      });
      if (error || !data?.session) throw new Error('invalid_credentials');
      await client.auth.setSession(data.session);
      return window.NaubAuth.profile();
    },
    signInPassword: async (email, password) => {
      if (!client) throw new Error('Supabase authentication is not configured.');
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error('invalid_credentials');
      return window.NaubAuth.profile();
    },
    registerStudent: async details => {
      if (!client) throw new Error('Supabase authentication is not configured.');
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
      if (error || !data?.ok) throw new Error(data?.error || 'registration_failed');
      return data;
    },
    markPresent: async sessionId => {
      if (!client) throw new Error('Supabase authentication is not configured.');
      const { data, error } = await client.rpc('mark_present', { p_session_id: sessionId });
      if (error) throw error;
      return data;
    },
    signOutAttendance: async sessionId => {
      if (!client) throw new Error('Supabase authentication is not configured.');
      const { data, error } = await client.rpc('sign_out_attendance', { p_session_id: sessionId });
      if (error) throw error;
      return data;
    },
    checkInLecturer: async scheduleId => {
      if (!client) throw new Error('Supabase authentication is not configured.');
      const { data, error } = await client.rpc('check_in_lecturer', { p_schedule_id: scheduleId });
      if (error) throw error;
      return data;
    },
    resetPassword: async email => {
      if (!client) throw new Error('Supabase authentication is not configured.');
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      });
      if (error) throw error;
    },
    profile: async () => {
      if (!client) throw new Error('Supabase authentication is not configured.');
      const { data, error } = await client.rpc('current_user_profile');
      if (error || !data?.id || data.account_status !== 'active') throw new Error('account_not_active');
      const roles = Array.isArray(data.roles) ? data.roles : [];
      const role = roles.includes('super_admin') || roles.includes('university_admin')
        ? 'admin'
        : roles.includes('lecturer') ? 'lecturer' : 'student';
      return {
        role,
        name: data.full_name,
        matricNumber: data.matric_number,
        staffId: data.staff_id,
        userId: data.id,
        universityId: data.university_id,
        production: true,
      };
    },
    restore: async () => {
      if (!client) return null;
      const { data } = await client.auth.getSession();
      if (!data.session) return null;
      return window.NaubAuth.profile();
    },
    signOut: async () => {
      if (client) {
        const { error } = await client.auth.signOut();
        if (error) throw error;
      }
    },
  };
})();
