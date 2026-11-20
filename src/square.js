// Minimal Square API client for memberships.
// Secrets/vars: SQUARE_ACCESS_TOKEN (required), SQUARE_LOCATION_ID (optional),
// SQUARE_API_BASE (optional: https://connect.squareupsandbox.com for sandbox testing).

const CADENCE = {
  DAILY: 'day', WEEKLY: 'week', EVERY_TWO_WEEKS: '2 weeks', THIRTY_DAYS: '30 days', SIXTY_DAYS: '60 days',
  NINETY_DAYS: '90 days', MONTHLY: 'month', EVERY_TWO_MONTHS: '2 months', QUARTERLY: '3 months',
  EVERY_FOUR_MONTHS: '4 months', EVERY_SIX_MONTHS: '6 months', ANNUAL: 'year', EVERY_TWO_YEARS: '2 years',
};

export function squareConfigured(env) {
  return Boolean(env.SQUARE_ACCESS_TOKEN);
}

async function sq(env, path, { method = 'GET', body } = {}) {
  const base = (env.SQUARE_API_BASE || 'https://connect.squareup.com').replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (env.SQUARE_VERSION) headers['Square-Version'] = env.SQUARE_VERSION;
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data.errors || []).map((e) => `${e.code}: ${e.detail || ''}`).join('; ');
    throw new Error(`Square ${method} ${path} failed (${res.status}) ${detail}`);
  }
  return data;
}

let locationCache = null;
export async function locationId(env) {
  if (env.SQUARE_LOCATION_ID) return env.SQUARE_LOCATION_ID;
  if (locationCache) return locationCache;
  const { locations = [] } = await sq(env, '/v2/locations');
  const loc = locations.find((l) => l.status === 'ACTIVE') || locations[0];
  if (!loc) throw new Error('No Square location found');
  locationCache = loc.id;
  return locationCache;
}

function money(m) {
  if (!m || typeof m.amount !== 'number') return null;
  return { amount: m.amount, currency: m.currency || 'USD' };
}

function formatMoney({ amount, currency }) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

let planCache = { at: 0, plans: [] };
// Returns [{ id (variation id), name, price: {amount, currency}, label: "$5 / month" }]
export async function listPlans(env) {
  if (Date.now() - planCache.at < 10 * 60 * 1000) return planCache.plans;
  const objects = [];
  let cursor;
  do {
    const q = `/v2/catalog/list?types=SUBSCRIPTION_PLAN,SUBSCRIPTION_PLAN_VARIATION${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await sq(env, q);
    objects.push(...(data.objects || []));
    cursor = data.cursor;
  } while (cursor);

  const planNames = {};
  const variations = [];
  for (const o of objects) {
    if (o.is_deleted) continue;
    if (o.type === 'SUBSCRIPTION_PLAN') {
      planNames[o.id] = o.subscription_plan_data?.name || '';
      for (const v of o.subscription_plan_data?.subscription_plan_variations || []) variations.push({ ...v, _planId: o.id });
    } else if (o.type === 'SUBSCRIPTION_PLAN_VARIATION') {
      variations.push(o);
    }
  }
  const seen = new Set();
  const plans = [];
  for (const v of variations) {
    if (v.is_deleted || seen.has(v.id)) continue;
    seen.add(v.id);
    const d = v.subscription_plan_variation_data || {};
    const phases = [...(d.phases || [])].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
    const phase = phases[0];
    if (!phase) continue;
    const pricing = phase.pricing || {};
    if (pricing.type && pricing.type !== 'STATIC') continue; // item-based pricing can't use quick pay
    const price = money(pricing.price_money) || money(pricing.price) || money(phase.recurring_price_money);
    if (!price) continue;
    const every = CADENCE[phase.cadence] || String(phase.cadence || '').toLowerCase();
    const planName = planNames[d.subscription_plan_id || v._planId] || '';
    const name = d.name || planName || 'Membership';
    plans.push({ id: v.id, name, planName, price, label: `${formatMoney(price)} / ${every}` });
  }
  plans.sort((a, b) => a.price.amount - b.price.amount);
  planCache = { at: Date.now(), plans };
  return plans;
}

export async function createCheckout(env, { plan, email, redirectUrl }) {
  const body = {
    idempotency_key: crypto.randomUUID(),
    quick_pay: { name: `Modyrn Pulse membership: ${plan.name}`, price_money: plan.price, location_id: await locationId(env) },
    checkout_options: { subscription_plan_id: plan.id, redirect_url: redirectUrl, ask_for_shipping_address: false },
    pre_populated_data: { buyer_email: email },
  };
  const { payment_link: link } = await sq(env, '/v2/online-checkout/payment-links', { method: 'POST', body });
  return { url: link.url || link.long_url, orderId: link.order_id };
}

async function customerIdsForEmail(env, email) {
  const data = await sq(env, '/v2/customers/search', {
    method: 'POST',
    body: { query: { filter: { email_address: { exact: email } } }, limit: 20 },
  });
  return (data.customers || []).map((c) => c.id);
}

async function activeSubscription(env, customerIds) {
  if (!customerIds.length) return null;
  const data = await sq(env, '/v2/subscriptions/search', {
    method: 'POST',
    body: { query: { filter: { customer_ids: customerIds.slice(0, 50) } }, limit: 100 },
  });
  const today = new Date().toISOString().slice(0, 10);
  return (data.subscriptions || []).find((s) => s.status === 'ACTIVE' && (!s.canceled_date || s.canceled_date > today)) || null;
}

// Is there an active Square subscription for this email (or known customer id)?
export async function findActive(env, { email, customerId }) {
  const ids = new Set(customerId ? [customerId] : []);
  for (const id of await customerIdsForEmail(env, email)) ids.add(id);
  const sub = await activeSubscription(env, [...ids]);
  return sub ? { customerId: sub.customer_id } : null;
}

// After checkout: confirm the order was paid and its buyer has an active subscription.
export async function confirmCheckout(env, { orderId, email }) {
  const { order } = await sq(env, `/v2/orders/${encodeURIComponent(orderId)}`);
  if (!order) return { status: 'unknown' };
  const ids = new Set();
  if (order.customer_id) ids.add(order.customer_id);
  for (const id of await customerIdsForEmail(env, email)) ids.add(id);
  const sub = await activeSubscription(env, [...ids]);
  if (sub) return { status: 'active', customerId: sub.customer_id };
  const paid = order.state === 'COMPLETED' || (order.tenders || []).length > 0;
  return { status: paid ? 'processing' : 'unpaid' };
}
