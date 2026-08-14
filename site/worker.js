// Cloudflare Worker — GitHub OAuth token exchange.
//
// This is the only backend. It exchanges the OAuth `code` for an access token
// using the client secret, which must NOT live in the browser. Point your
// OAuth App's callback to https://<your-pages-domain>/callback.html and set
// `OAUTH_WORKER_URL` below in app.js to this worker's URL.
//
// Deploy: `wrangler deploy`. Secrets via `wrangler secret put`.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/exchange") {
      return handleExchange(url, env);
    }
    return new Response("ok", { status: 200 });
  },
};

async function handleExchange(url, env) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) return json({ error: "missing code" }, 400);

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      state,
    }),
  });

  const data = await res.json();
  if (data.error) return json({ error: data.error }, 400);

  // Do NOT echo the token back as-is without CORS allow for your origin.
  return new Response(JSON.stringify({ access_token: data.access_token }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
