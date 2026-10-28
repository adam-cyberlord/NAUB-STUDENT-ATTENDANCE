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

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const { matric_number, password } = await request.json().catch(() => ({}));
  const normalized = String(matric_number ?? '').trim().replace(/\s+/g, '').toUpperCase();
  if (!normalized || typeof password !== 'string' || password.length < 8) {
    return json({ error: 'invalid_credentials' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: user, error: lookupError } = await admin
    .from('users')
    .select('id, university_id, account_status')
    .eq('normalized_matric_number', normalized)
    .is('deleted_at', null)
    .maybeSingle();

  if (lookupError || !user || user.account_status !== 'active') {
    return json({ error: 'invalid_credentials' }, 401);
  }

  const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(user.id);
  if (authLookupError || !authUser.user?.email) return json({ error: 'invalid_credentials' }, 401);

  const publicClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { autoRefreshToken: true, persistSession: false } },
  );
  const { data: session, error: signInError } = await publicClient.auth.signInWithPassword({
    email: authUser.user.email,
    password,
  });
  if (signInError || !session.session) return json({ error: 'invalid_credentials' }, 401);
  return json({ session: session.session });
});
