// Cloudflare Worker for modyrnpulse.com.
// Static pages are served from dist/. This Worker handles membership:
//   /join      choose a plan and go to Square checkout
//   /welcome   Square sends buyers back here to create their password
//   /login, /logout, /account, /reset
//   /members/  members-only content (needs an active Square subscription)

import SHELL from '../build/shell.html';
import POSTS from '../build/members.json';
import { listPlans, createCheckout, confirmCheckout, findActive, squareConfigured } from './square.js';
import {
  hashPassword, checkPassword, passwordProblem, cleanEmail, createSession, clearCookie,
  currentMember, endSession, getMember,
} from './auth.js';

const HOUR = 3600000;

// ---------- helpers ----------
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function html(body, { title, description = '', path = '/members/', status = 200, headers = {}, noindex = true } = {}) {
  let page = SHELL.replaceAll('__TITLE__', esc(title)).replaceAll('__DESC__', esc(description)).replaceAll('__PATH__', path);
  if (noindex) page = page.replace('<head>', '<head>\n<meta name="robots" content="noindex">');
  page = page.replace('<!--BODY-->', body);
  return new Response(page, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', ...headers },
  });
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store', ...headers } });
}

function safeNext(v) {
  const s = String(v || '');
  return s.startsWith('/') && !s.startsWith('//') && !s.includes('\\') ? s : '/members/';
}

async function form(request) {
  try { return Object.fromEntries(await request.formData()); } catch { return {}; }
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

function panel(inner) {
  return `<div class="wrap"><section class="auth">${inner}</section></div>`;
}

function notice(msg, kind = 'error') {
  return msg ? `<p class="notice notice-${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${esc(msg)}</p>` : '';
}

const soon = () => html(panel(`<p class="eyebrow">Membership</p><h1 class="h2">Memberships open <em>soon.</em></h1>
  <p class="lede">We’re putting the finishing touches on members-only rabbit holes. Check back shortly.</p>
  <p><a class="btn btn-ghost" href="/">Back home</a></p>`), { title: 'Membership', path: '/join/' });

// Is this member's Square subscription active? Cached so Square isn't asked on every page view.
async function isActive(env, m) {
  const now = Date.now();
  if (m.sub_active && now - m.sub_checked_at < 6 * HOUR) return true;
  if (!m.sub_active && now - m.sub_checked_at < 5 * 60000) return false;
  try {
    const found = await findActive(env, { email: m.email, customerId: m.square_customer_id });
    const active = Boolean(found);
    await env.DB.prepare(
      'UPDATE members SET sub_active = ?2, sub_checked_at = ?3, sub_last_active_at = CASE WHEN ?2 = 1 THEN ?3 ELSE sub_last_active_at END, square_customer_id = COALESCE(?4, square_customer_id) WHERE email = ?1',
    ).bind(m.email, active ? 1 : 0, now, found?.customerId || null).run();
    return active;
  } catch (err) {
    console.error('Square check failed', err);
    // If Square can't be reached, don't lock out someone who was active in the last 3 days.
    return now - m.sub_last_active_at < 72 * HOUR;
  }
}

// ---------- members content ----------
function postCards(active) {
  if (!POSTS.length) return '<p class="lede">The first members-only rabbit hole is on its way.</p>';
  return `<div class="grid">${POSTS.map((p) => `<a class="card${active ? '' : ' locked'}" href="/members/${p.slug}/">
    <div class="card-top"><span class="cat">${esc(p.dateLabel)}</span>${active ? '' : '<span class="lock">Members</span>'}</div>
    <h3>${esc(p.title)}</h3>
    ${p.summary ? `<p class="blurb">${esc(p.summary)}</p>` : ''}
  </a>`).join('')}</div>`;
}

function joinBox(next) {
  return `<div class="join-box">
    <div><h2 class="h3">Become a member to unlock this.</h2><p>Members get every members-only rabbit hole as we make them. Cancel anytime.</p></div>
    <div class="join-actions"><a class="btn btn-accent" href="/join/">Become a member</a><a class="btn btn-ghost" href="/login/?next=${encodeURIComponent(next)}">Log in</a></div>
  </div>`;
}

async function membersIndex(request, env, member) {
  const active = member ? await isActive(env, member) : false;
  const url = new URL(request.url);
  const welcome = url.searchParams.get('welcome') ? notice('You’re in. Welcome to Modyrn Pulse membership!', 'ok') : '';
  const lapsed = member && !active ? notice('Your membership isn’t active right now. Rejoin to unlock members-only rabbit holes.', 'error') : '';
  const body = `<div class="wrap">
    <section class="hero" style="padding-bottom:40px">
      <div class="hero-main">
        <p class="eyebrow">Members only</p>
        <h1 class="display">The deep <em>end.</em></h1>
        <p class="lede">Members-only rabbit holes, made whenever we find something worth it.</p>
      </div>
      <div class="hero-cta">${member
        ? `<a class="btn btn-ghost btn-lg" href="/account/">Your account</a>${active ? '' : '<a class="btn btn-accent btn-lg" href="/join/">Rejoin</a>'}`
        : '<a class="btn btn-accent btn-lg" href="/join/">Become a member</a><a class="btn btn-ghost btn-lg" href="/login/">Log in</a>'}</div>
    </section>
    ${welcome}${lapsed}
    <section class="section">${postCards(active)}</section>
  </div>`;
  return html(body, { title: 'Members', description: 'Members-only rabbit holes from Modyrn Pulse.', path: '/members/', noindex: false });
}

async function membersPost(request, env, member, slug) {
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) return html(panel('<h1 class="h2">Not found</h1><p><a href="/members/">Back to members</a></p>'), { title: 'Not found', status: 404 });
  const active = member ? await isActive(env, member) : false;
  const path = `/members/${post.slug}/`;
  const content = active
    ? `<article class="article members-article">${post.html}</article>`
    : `${post.summary ? `<p class="lede">${esc(post.summary)}</p>` : ''}${member ? notice('Your membership isn’t active right now.', 'error') : ''}${joinBox(path)}`;
  const body = `<div class="wrap">
    <a class="back" href="/members/">← All members-only holes</a>
    <section class="hole-hero" style="border:0;padding-bottom:16px"><div class="main">
      <p class="eyebrow muted"><span style="color:var(--accent)">Members only</span> · ${esc(post.dateLabel)}</p>
      <h1 class="display">${esc(post.title)}</h1>
    </div></section>
    ${content}
    <div style="height:96px"></div>
  </div>`;
  return html(body, { title: post.title, description: post.summary || 'A members-only rabbit hole.', path, noindex: false });
}

// ---------- join ----------
async function joinPage(request, env, member, { error = '', email = '' } = {}) {
  if (!squareConfigured(env)) return soon();
  if (member && (await isActive(env, member))) return redirect('/members/');
  let plans;
  try { plans = await listPlans(env); } catch (err) { console.error(err); return soon(); }
  if (!plans.length) return soon();
  const options = plans.map((p, i) => `<label class="plan">
      <input type="radio" name="plan" value="${esc(p.id)}"${i === 0 ? ' checked' : ''}>
      <span class="plan-body"><span class="plan-price">${esc(p.label)}</span><span class="plan-name">${esc(p.name)}</span></span>
    </label>`).join('');
  const body = panel(`<p class="eyebrow">Membership</p>
    <h1 class="h2">Go deeper with <em>Modyrn Pulse.</em></h1>
    <p class="lede">Members unlock every members-only rabbit hole as we make them, and keep the site independent. Cancel anytime.</p>
    ${notice(error)}
    <form method="post" action="/join/" class="auth-form">
      <fieldset class="plans"><legend>Choose a plan</legend>${options}</fieldset>
      <div class="field"><label for="j-email">Email address</label><input class="input" id="j-email" name="email" type="email" required autocomplete="email" maxlength="254" value="${esc(email || member?.email || '')}"></div>
      <p class="hint">Use the same email at checkout. It becomes your login.</p>
      <button class="btn btn-accent btn-lg" type="submit">Continue to secure checkout <span aria-hidden="true">→</span></button>
      <p class="hint center">Payments are handled by Square.</p>
    </form>
    <p class="switch">Already a member? <a href="/login/">Log in</a></p>`);
  return html(body, { title: 'Become a member', path: '/join/', noindex: false });
}

async function joinSubmit(request, env, member) {
  if (!squareConfigured(env)) return soon();
  const f = await form(request);
  const email = cleanEmail(f.email);
  if (!email) return joinPage(request, env, member, { error: 'Please enter a valid email address.', email: f.email });
  const existing = await getMember(env, email);
  if (existing && (await isActive(env, existing))) {
    return joinPage(request, env, member, { error: 'That email already has an active membership. Log in instead.', email });
  }
  let plans;
  try { plans = await listPlans(env); } catch { return soon(); }
  const plan = plans.find((p) => p.id === f.plan) || plans[0];
  if (!plan) return soon();
  try {
    const origin = new URL(request.url).origin;
    const { url, orderId } = await createCheckout(env, { plan, email, redirectUrl: `${origin}/welcome/` });
    await env.DB.prepare('INSERT OR REPLACE INTO pending_checkouts (order_id, email, plan_name, created_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(orderId, email, plan.label, Date.now()).run();
    if (Math.random() < 0.1) await env.DB.prepare('DELETE FROM pending_checkouts WHERE created_at < ?1').bind(Date.now() - 14 * 24 * HOUR).run();
    return redirect(url);
  } catch (err) {
    console.error('checkout failed', err);
    return joinPage(request, env, member, { error: 'We couldn’t start checkout. Please try again in a minute.', email });
  }
}

// ---------- welcome (after Square checkout) ----------
async function welcomePage(request, env, { error = '' } = {}) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get('orderId') || url.searchParams.get('order_id') || '';
  const tries = Math.min(Number(url.searchParams.get('t') || 0), 99);
  const pending = orderId ? await env.DB.prepare('SELECT * FROM pending_checkouts WHERE order_id = ?1').bind(orderId).first() : null;
  if (!pending) {
    return html(panel(`<h1 class="h2">We couldn’t find that checkout.</h1>
      <p class="lede">If you’ve already set up your account, log in. If you just paid and this keeps happening, contact us and we’ll sort it out.</p>
      <p class="join-actions"><a class="btn btn-accent" href="/login/">Log in</a><a class="btn btn-ghost" href="/join/">Membership</a></p>`), { title: 'Checkout', path: '/welcome/' });
  }
  if (await getMember(env, pending.email)) {
    return html(panel(`<p class="eyebrow">Welcome back</p><h1 class="h2">You already have an account.</h1>
      <p class="lede">Log in with ${esc(pending.email)} to get to the members-only rabbit holes.</p>
      <p><a class="btn btn-accent" href="/login/?email=${encodeURIComponent(pending.email)}">Log in</a></p>`), { title: 'Welcome', path: '/welcome/' });
  }
  let result;
  try { result = await confirmCheckout(env, { orderId, email: pending.email }); } catch (err) { console.error(err); result = { status: 'processing' }; }

  if (result.status === 'active') {
    return html(panel(`<p class="eyebrow">Payment confirmed</p>
      <h1 class="h2">You’re in. <em>Set your password.</em></h1>
      <p class="lede">Your login is <strong>${esc(pending.email)}</strong>.</p>
      ${notice(error)}
      <form method="post" action="/welcome/" class="auth-form">
        <input type="hidden" name="orderId" value="${esc(orderId)}">
        <input type="email" name="username" value="${esc(pending.email)}" autocomplete="username" hidden>
        <div class="field"><label for="w-pw">Password</label><input class="input" id="w-pw" name="password" type="password" required minlength="8" autocomplete="new-password"></div>
        <div class="field"><label for="w-pw2">Password again</label><input class="input" id="w-pw2" name="password2" type="password" required minlength="8" autocomplete="new-password"></div>
        <p class="hint">At least 8 characters.</p>
        <button class="btn btn-accent btn-lg" type="submit">Create my account</button>
      </form>`), { title: 'Welcome', path: '/welcome/' });
  }
  if (result.status === 'processing' && tries < 20) {
    const next = `/welcome/?orderId=${encodeURIComponent(orderId)}&t=${tries + 1}`;
    return html(panel(`<p class="eyebrow">One moment</p><h1 class="h2">Confirming your payment…</h1>
      <p class="lede">Square is finishing up. This page refreshes on its own.</p>
      <p><a class="btn btn-ghost" href="${esc(next)}">Check again</a></p>`), { title: 'Confirming', path: '/welcome/', headers: { refresh: `3; url=${next}` } });
  }
  if (result.status === 'processing') {
    return html(panel(`<h1 class="h2">This is taking longer than usual.</h1>
      <p class="lede">Your payment went through but Square hasn’t finished setting up the subscription. Try again in a few minutes.</p>
      <p><a class="btn btn-accent" href="/welcome/?orderId=${encodeURIComponent(orderId)}">Try again</a></p>`), { title: 'Confirming', path: '/welcome/' });
  }
  return html(panel(`<h1 class="h2">Checkout isn’t finished.</h1>
    <p class="lede">We didn’t see a completed payment for this checkout.</p>
    <p><a class="btn btn-accent" href="/join/">Back to membership</a></p>`), { title: 'Checkout', path: '/welcome/' });
}

async function welcomeSubmit(request, env) {
  const f = await form(request);
  const orderId = String(f.orderId || '');
  const backUrl = new URL(request.url);
  backUrl.search = `?orderId=${encodeURIComponent(orderId)}`;
  const again = (error) => welcomePage(new Request(backUrl, { headers: request.headers }), env, { error });
  const problem = passwordProblem(f.password, f.password2);
  if (problem) return again(problem);
  const pending = await env.DB.prepare('SELECT * FROM pending_checkouts WHERE order_id = ?1').bind(orderId).first();
  if (!pending) return again('');
  if (await getMember(env, pending.email)) return redirect(`/login/?email=${encodeURIComponent(pending.email)}`);
  const result = await confirmCheckout(env, { orderId, email: pending.email }).catch(() => ({ status: 'processing' }));
  if (result.status !== 'active') return again('We couldn’t confirm your payment yet. Please try again in a moment.');
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO members (email, password_hash, square_customer_id, sub_active, sub_checked_at, sub_last_active_at) VALUES (?1, ?2, ?3, 1, ?4, ?4)',
  ).bind(pending.email, await hashPassword(f.password), result.customerId || null, now).run();
  await env.DB.prepare('DELETE FROM pending_checkouts WHERE email = ?1').bind(pending.email).run();
  return redirect('/members/?welcome=1', { 'set-cookie': await createSession(env, pending.email) });
}

// ---------- login / logout ----------
function loginPage(request, { error = '', email = '' } = {}) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  const reset = url.searchParams.get('reset') ? notice('Password updated. Log in with your new password.', 'ok') : '';
  const body = panel(`<p class="eyebrow">Members</p><h1 class="h2">Log in</h1>
    ${reset}${notice(error)}
    <form method="post" action="/login/?next=${encodeURIComponent(next)}" class="auth-form">
      <div class="field"><label for="l-email">Email address</label><input class="input" id="l-email" name="email" type="email" required autocomplete="username" maxlength="254" value="${esc(email || url.searchParams.get('email') || '')}"></div>
      <div class="field"><label for="l-pw">Password</label><input class="input" id="l-pw" name="password" type="password" required autocomplete="current-password"></div>
      <button class="btn btn-accent btn-lg" type="submit">Log in</button>
    </form>
    <p class="switch">Forgot your password? Contact us and we’ll send you a reset link.</p>
    <p class="switch">Not a member yet? <a href="/join/">Become a member</a></p>`);
  return html(body, { title: 'Log in', path: '/login/' });
}

async function loginSubmit(request, env) {
  const f = await form(request);
  const email = cleanEmail(f.email);
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  const fail = 'That email and password don’t match.';
  if (!email || !f.password) return loginPage(request, { error: fail, email: f.email });
  const m = await getMember(env, email);
  const now = Date.now();
  if (m && m.locked_until > now) return loginPage(request, { error: 'Too many attempts. Try again in 15 minutes.', email });
  let ok = false;
  if (m) ok = await checkPassword(String(f.password), m.password_hash);
  else await hashPassword('timing-padding'); // keep response time similar for unknown emails
  if (!ok) {
    if (m) {
      const fails = m.failed_logins + 1;
      await env.DB.prepare('UPDATE members SET failed_logins = ?2, locked_until = ?3 WHERE email = ?1')
        .bind(email, fails >= 8 ? 0 : fails, fails >= 8 ? now + 15 * 60000 : 0).run();
    }
    return loginPage(request, { error: fail, email });
  }
  await env.DB.prepare('UPDATE members SET failed_logins = 0, locked_until = 0 WHERE email = ?1').bind(email).run();
  return redirect(next, { 'set-cookie': await createSession(env, email) });
}

// ---------- account ----------
async function accountPage(request, env, member, { error = '', ok = '' } = {}) {
  if (!member) return redirect('/login/?next=/account/');
  const active = await isActive(env, member);
  const body = panel(`<p class="eyebrow">Your account</p><h1 class="h2">${esc(member.email)}</h1>
    <p class="status ${active ? 'on' : 'off'}">${active ? 'Membership active' : 'Membership not active'}</p>
    ${active ? '' : '<p><a class="btn btn-accent" href="/join/">Rejoin</a></p>'}
    <p class="hint">To change your card or cancel, use the link in your Square subscription emails, or contact us.</p>
    ${notice(error)}${notice(ok, 'ok')}
    <form method="post" action="/account/password/" class="auth-form">
      <h2 class="h3" style="font-size:28px;margin-top:24px">Change password</h2>
      <input type="email" name="username" value="${esc(member.email)}" autocomplete="username" hidden>
      <div class="field"><label for="a-cur">Current password</label><input class="input" id="a-cur" name="current" type="password" required autocomplete="current-password"></div>
      <div class="field"><label for="a-pw">New password</label><input class="input" id="a-pw" name="password" type="password" required minlength="8" autocomplete="new-password"></div>
      <div class="field"><label for="a-pw2">New password again</label><input class="input" id="a-pw2" name="password2" type="password" required minlength="8" autocomplete="new-password"></div>
      <button class="btn btn-ghost" type="submit">Update password</button>
    </form>
    <form method="post" action="/logout/" class="logout"><button class="btn btn-ghost" type="submit">Log out</button></form>`);
  return html(body, { title: 'Your account', path: '/account/' });
}

async function passwordSubmit(request, env, member) {
  if (!member) return redirect('/login/?next=/account/');
  const f = await form(request);
  if (!(await checkPassword(String(f.current || ''), member.password_hash))) return accountPage(request, env, member, { error: 'Your current password isn’t right.' });
  const problem = passwordProblem(f.password, f.password2);
  if (problem) return accountPage(request, env, member, { error: problem });
  await env.DB.prepare('UPDATE members SET password_hash = ?2 WHERE email = ?1').bind(member.email, await hashPassword(f.password)).run();
  return accountPage(request, env, member, { ok: 'Password updated.' });
}

// ---------- reset (owner issues a code from the Cloudflare D1 console) ----------
async function resetPage(request, env, { error = '' } = {}) {
  const code = new URL(request.url).searchParams.get('code') || '';
  const m = code ? await env.DB.prepare('SELECT email FROM members WHERE reset_code = ?1 AND reset_expires > ?2').bind(code, Date.now()).first() : null;
  if (!m) {
    return html(panel(`<h1 class="h2">That reset link has expired.</h1><p class="lede">Contact us for a new one.</p><p><a class="btn btn-ghost" href="/login/">Log in</a></p>`), { title: 'Reset password', path: '/reset/' });
  }
  return html(panel(`<p class="eyebrow">Reset password</p><h1 class="h2">${esc(m.email)}</h1>${notice(error)}
    <form method="post" action="/reset/?code=${encodeURIComponent(code)}" class="auth-form">
      <input type="email" name="username" value="${esc(m.email)}" autocomplete="username" hidden>
      <div class="field"><label for="r-pw">New password</label><input class="input" id="r-pw" name="password" type="password" required minlength="8" autocomplete="new-password"></div>
      <div class="field"><label for="r-pw2">New password again</label><input class="input" id="r-pw2" name="password2" type="password" required minlength="8" autocomplete="new-password"></div>
      <button class="btn btn-accent btn-lg" type="submit">Save new password</button>
    </form>`), { title: 'Reset password', path: '/reset/' });
}

async function resetSubmit(request, env) {
  const code = new URL(request.url).searchParams.get('code') || '';
  const f = await form(request);
  const m = code ? await env.DB.prepare('SELECT email FROM members WHERE reset_code = ?1 AND reset_expires > ?2').bind(code, Date.now()).first() : null;
  if (!m) return resetPage(request, env);
  const problem = passwordProblem(f.password, f.password2);
  if (problem) return resetPage(request, env, { error: problem });
  await env.DB.prepare('UPDATE members SET password_hash = ?2, reset_code = NULL, reset_expires = 0, failed_logins = 0, locked_until = 0 WHERE email = ?1')
    .bind(m.email, await hashPassword(f.password)).run();
  await env.DB.prepare('DELETE FROM sessions WHERE email = ?1').bind(m.email).run();
  return redirect('/login/?reset=1&email=' + encodeURIComponent(m.email));
}

// ---------- email sign-up (form currently switched off on the site) ----------
async function subscribe(request, env) {
  const f = await form(request);
  const json = (request.headers.get('accept') || '').includes('application/json');
  const done = (ok, message, status = 200) => (json
    ? new Response(JSON.stringify({ ok, message }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
    : redirect(`/subscribed/${ok ? '' : '?error=1'}`));
  if (f.website) return done(true, 'Thanks! You’re on the list.');
  const email = cleanEmail(f.email);
  if (!email) return done(false, 'That email address doesn’t look right.', 400);
  await env.DB.prepare('INSERT OR IGNORE INTO subscribers (email, source) VALUES (?1, ?2)').bind(email, String(f.source || '').slice(0, 100) || null).run();
  return done(true, 'Thanks! You’re on the list.');
}

// ---------- router ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const bare = ['/members', '/join', '/welcome', '/login', '/logout', '/account', '/reset'];
    if (method === 'GET' && (bare.includes(path) || (path.startsWith('/members/') && !path.endsWith('/')))) {
      return redirect(path + '/' + url.search);
    }
    if (method === 'POST' && !sameOrigin(request)) return new Response('Forbidden', { status: 403 });

    try {
      if (path === '/api/subscribe') {
        return method === 'POST' ? subscribe(request, env) : new Response('Method not allowed', { status: 405 });
      }
      if (path.startsWith('/api/')) return new Response('Not found', { status: 404 });

      const member = await currentMember(request, env);
      if (path === '/members/') return membersIndex(request, env, member);
      const m = path.match(/^\/members\/([a-z0-9-]+)\/$/);
      if (m) return membersPost(request, env, member, m[1]);
      if (path === '/join/') return method === 'POST' ? joinSubmit(request, env, member) : joinPage(request, env, member);
      if (path === '/welcome/') return method === 'POST' ? welcomeSubmit(request, env) : welcomePage(request, env);
      if (path === '/login/') {
        if (method === 'POST') return loginSubmit(request, env);
        return member ? redirect(safeNext(url.searchParams.get('next'))) : loginPage(request);
      }
      if (path === '/logout/' && method === 'POST') {
        await endSession(request, env);
        return redirect('/', { 'set-cookie': clearCookie() });
      }
      if (path === '/account/') return accountPage(request, env, member);
      if (path === '/account/password/' && method === 'POST') return passwordSubmit(request, env, member);
      if (path === '/reset/') return method === 'POST' ? resetSubmit(request, env) : resetPage(request, env);
    } catch (err) {
      console.error('request failed', err);
      return html(panel('<h1 class="h2">Something went wrong.</h1><p class="lede">Please try again in a minute.</p>'), { title: 'Error', status: 500, path });
    }
    return env.ASSETS.fetch(request);
  },
};
