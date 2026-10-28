import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clean(value: unknown, maxLength: number) {
  const result = String(value ?? '').trim();
  return result.length > 0 && result.length <= maxLength ? result : null;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await request.json().catch(() => ({}));
  const fullName = clean(body.full_name, 120);
  const matricNumber = clean(body.matric_number, 40);
  const normalizedMatric = matricNumber?.replace(/\s+/g, '').toUpperCase() ?? '';
  const email = clean(body.email, 254)?.toLowerCase() ?? '';
  const password = typeof body.password === 'string' ? body.password : '';
  const department = clean(body.department, 120);
  const faculty = clean(body.faculty, 120);
  const level = clean(body.level, 20);
  const academicSession = clean(body.academic_session, 40);
  const phone = clean(body.phone, 30);
  const universitySlug = clean(body.university_slug, 80) ?? 'naub';

  if (!fullName || !matricNumber || !department || !faculty || !level || !academicSession
    || !email || !phone || password.length < 8 || !email.includes('@')) {
    return json({ error: 'invalid_registration_details' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: university, error: universityError } = await admin
    .from('universities')
    .select('id')
    .eq('slug', universitySlug)
    .maybeSingle();
  if (universityError || !university) return json({ error: 'university_not_configured' }, 400);

  const { data: duplicate } = await admin
    .from('users')
    .select('id')
    .eq('university_id', university.id)
    .eq('normalized_matric_number', normalizedMatric)
    .is('deleted_at', null)
    .maybeSingle();
  if (duplicate) return json({ error: 'matric_number_already_registered' }, 409);

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: fullName, matric_number: matricNumber },
  });
  if (authError || !authUser.user) {
    const message = authError?.code === 'email_exists' ? 'email_already_registered' : 'registration_failed';
    return json({ error: message }, authError?.code === 'email_exists' ? 409 : 400);
  }

  const { data: studentRole, error: roleError } = await admin
    .from('roles')
    .select('id')
    .eq('name', 'student')
    .single();
  const { error: profileError } = await admin.from('users').insert({
    id: authUser.user.id,
    university_id: university.id,
    full_name: fullName,
    matric_number: matricNumber,
    faculty,
    department,
    level,
    academic_session: academicSession,
    phone,
    account_status: 'pending',
  });
  if (roleError || profileError || !studentRole) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return json({ error: 'registration_failed' }, 500);
  }
  const { error: assignmentError } = await admin.from('user_roles').insert({
    user_id: authUser.user.id,
    university_id: university.id,
    role_id: studentRole.id,
  });
  if (assignmentError) {
    await admin.from('users').delete().eq('id', authUser.user.id);
    await admin.auth.admin.deleteUser(authUser.user.id);
    return json({ error: 'registration_failed' }, 500);
  }

  return json({ ok: true, requiresApproval: true });
});
