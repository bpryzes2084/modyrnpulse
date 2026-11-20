// Cloudflare Worker for modyrnpulse.com.
// Serves the static site from dist/ and handles two routes:
//   POST /api/subscribe         saves an email address to the D1 database
//   GET  /api/subscribers.csv   downloads every address (needs ?key=ADMIN_KEY)

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

function sameKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function exportCsv(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_KEY || !sameKey(key, env.ADMIN_KEY)) {
    return new Response('Not found', { status: 404 });
  }
  const { results } = await env.DB.prepare('SELECT email, created_at, source FROM subscribers ORDER BY created_at').all();
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = ['email,signed_up_utc,source', ...results.map((r) => [r.email, r.created_at, r.source].map(cell).join(','))].join('\r\n');
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv + '\r\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="modyrnpulse-subscribers-${day}.csv"`,
      'cache-control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/subscribe') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
      return subscribe(request, env);
    }
    if (pathname === '/api/subscribers.csv' && request.method === 'GET') return exportCsv(request, env);
    if (pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
