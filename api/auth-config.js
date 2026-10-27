module.exports = (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json');
  response.status(200).json({
    url: process.env.SUPABASE_URL_2 || process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY_2 || process.env.SUPABASE_PUBLISHABLE_KEY,
  });
};
