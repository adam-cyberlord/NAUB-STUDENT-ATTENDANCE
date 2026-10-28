function usableValue(primary, fallback, predicate) {
  if (predicate(primary)) return primary;
  if (predicate(fallback)) return fallback;
  return undefined;
}

module.exports = (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json');

  const url = usableValue(
    process.env.SUPABASE_URL_2,
    process.env.SUPABASE_URL,
    value => typeof value === 'string' && value.startsWith('https://') && !value.includes('process.env'),
  );
  const publishableKey = usableValue(
    process.env.SUPABASE_PUBLISHABLE_KEY_2,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    value => typeof value === 'string' && value.startsWith('sb_') && !value.includes('process.env'),
  );

  if (!url || !publishableKey) {
    response.status(503).json({ error: 'Supabase authentication is not configured.' });
    return;
  }

  response.status(200).json({ url, publishableKey });
};
