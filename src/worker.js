// Cloudflare Worker for modyrnpulse.com.
// Serves the static site from dist/ and handles one route:
//   POST /api/subscribe   saves an email address to the D1 database

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

function wantsJson(request) {
  return (request.headers.get('accept') || '').includes('application/json');
}

function reply(request, status, ok, message) {
  if (wantsJson(request)) {
    return new Response(JSON.stringify({ ok, message }), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  const url = new URL(request.url);
  return Response.redirect(`${url.origin}/subscribed/${ok ? '' : '?error=1'}`, 303);
}

async function subscribe(request, env) {
  let data;
  try {
    const type = request.headers.get('content-type') || '';
    data = type.includes('application/json') ? await request.json() : Object.fromEntries(await request.formData());
  } catch {
    return reply(request, 400, false, 'Something went wrong. Please try again.');
  }

  // Honeypot: real people never fill this hidden field.
  if (data.website) return reply(request, 200, true, 'Thanks! You’re on the list.');

  const email = String(data.email || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return reply(request, 400, false, 'That email address doesn’t look right.');
  }
  const source = String(data.source || '').slice(0, 100) || null;

  try {
    await env.DB.prepare('INSERT OR IGNORE INTO subscribers (email, source) VALUES (?1, ?2)').bind(email, source).run();
  } catch (err) {
    console.error('subscribe failed', err);
    return reply(request, 500, false, 'Something went wrong. Please try again.');
  }
  return reply(request, 200, true, 'Thanks! You’re on the list.');
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/subscribe') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
      return subscribe(request, env);
    }
    if (pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
