export const corsHeaders = (env) => ({
  'Access-Control-Allow-Origin':  env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code, X-Admin-Token, X-Partner-Id',
  'Access-Control-Max-Age': '86400',
});

export const jsonResponse = (data, status = 200, env) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env),
    },
  });
};

export const errorResponse = (message, status = 400, env) => {
  return jsonResponse({ success: false, error: message }, status, env);
};
