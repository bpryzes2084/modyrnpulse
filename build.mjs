// Builds the static site into ./dist. No dependencies: run `node build.mjs`.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'dist');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const site = read('data/site.json');
const holes = read('data/holes.json');
const curated = read('data/curated.json');

const CATS = ['Interactive Wonders', 'Weird Web', 'Archives', 'Live Planet', 'Knowledge Spirals'];
const DEPTH = ['', 'Quick dip', 'Shallow', 'Deep', 'Very deep', 'Bottomless'];
const TIMES = [
  { id: 'any', label: 'Any time', hint: '' },
  { id: 'quick', label: '5 minutes', hint: 'Quick dips', min: 1, max: 2 },
  { id: 'hour', label: 'An hour', hint: 'Deep, not endless', min: 3, max: 4 },
  { id: 'night', label: 'All night', hint: 'Bottomless', min: 5, max: 5 },
];
const pad = (n) => String(n).padStart(2, '0');
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const host = (u) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');
const slugify = (s) => s.toLowerCase().replace(/’/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const bySlug = Object.fromEntries(holes.map((h) => [h.slug, h]));
const holePath = (h) => `/holes/${h.slug}/`;
const ver = Date.now().toString(36);

// Legal pages: drop an .html fragment into content/legal/ (privacy.html, terms.html, dmca.html) and it gets a page + footer link.
const LEGAL = { privacy: 'Privacy Policy', terms: 'Terms of Service', dmca: 'DMCA' };
const legalDir = join(ROOT, 'content/legal');
const legal = Object.entries(LEGAL)
  .filter(([k]) => existsSync(join(legalDir, `${k}.html`)))
  .map(([k, title]) => ({ slug: k, title, html: readFileSync(join(legalDir, `${k}.html`), 'utf8') }));

const logo = `<svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#C8F135" stroke-width="2" stroke-linecap="round"><circle cx="14" cy="14" r="12"/><circle cx="14" cy="14" r="7"/><circle cx="14" cy="14" r="2.5"/></svg>`;
const panelIcon = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>`;

function depthBar(d) {
  return `<div class="depth"><span>DEPTH</span><span class="bar" aria-hidden="true"><i style="width:${d * 20}%"></i></span><b>${DEPTH[d]}</b></div>`;
}

function sidePanel(current) {
  const groups = CATS.map((cat) => {
    const items = holes.filter((h) => h.cat === cat);
    return `<details class="side-group" open>
  <summary>${esc(cat)}<span class="count">${items.length}</span></summary>
  <ul>${items.map((h) => `<li><a href="${holePath(h)}" data-slug="${h.slug}"${current && current.slug === h.slug ? ' aria-current="page"' : ''}><span class="n">${pad(h.num)}</span><span>${esc(h.name)}</span></a></li>`).join('')}</ul>
</details>`;
  }).join('\n');
  return `<aside id="all-holes" class="side-panel" aria-label="All rabbit holes">
  <div class="side-head"><h2>All rabbit holes</h2><button type="button" class="btn btn-ghost side-close" data-panel-close aria-label="Close list">Close</button></div>
  <div class="progress" data-progress-box><p data-progress>Open a site to start tracking what you’ve explored.</p><div class="progress-bar" aria-hidden="true"><i data-progress-bar></i></div><button type="button" class="link-btn" data-progress-reset hidden>Reset progress</button></div>
  ${groups}
</aside>
<div class="scrim" data-panel-close></div>`;
}

function card(h) {
  const text = esc(`${h.name} ${host(h.url)} ${h.cat} ${h.blurb}`.toLowerCase());
  return `<a class="card" href="${holePath(h)}" data-slug="${h.slug}" data-depth="${h.depth}" data-cat="${esc(h.cat)}" data-text="${text}">
  <div class="card-top"><span class="n">${pad(h.num)}</span><span class="explored-badge">✓ Explored</span><span class="cat">${esc(h.cat)}</span></div>
  <h3>${esc(h.name)}</h3>
  <p class="url">${esc(host(h.url))}</p>
  <p class="blurb">${esc(h.blurb)}</p>
  ${depthBar(h.depth)}
</a>`;
}

function page({ title, description, path, body, current, jsonld }) {
  const url = site.url + path;
  const fullTitle = title ? `${title} · ${site.name}` : `${site.name} — Legendary Internet Rabbit Holes`;
  const footerLinks = [
    site.suggestEmail ? `<a href="mailto:${esc(site.suggestEmail)}?subject=Rabbit%20hole%20suggestion">Suggest a rabbit hole</a>` : '',
    ...legal.map((l) => `<a href="/${l.slug}/">${esc(l.title)}</a>`),
  ].filter(Boolean).join('\n      ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#0D0C12">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/styles.css?v=${ver}">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <nav class="site-nav" aria-label="Main">
    <a class="brand" href="/">${logo}<span>Modyrn <em>Pulse</em></span></a>
    <div class="nav-links">
      <button type="button" class="btn btn-ghost" data-panel-toggle aria-controls="all-holes" aria-expanded="true">${panelIcon}<span data-label>Hide list</span></button>
      <a class="hide-sm" href="/#curated">Collections</a>
      <button type="button" class="btn btn-accent" data-random>Random hole</button>
    </div>
  </nav>
</header>
<div class="layout">
${sidePanel(current)}
<div class="content">
<main id="main">
${body}
</main>
<div class="wrap">
  <footer class="site-footer">
    <span>© ${site.year} ${esc(site.owner)} · ${esc(site.name)}</span>
    <nav aria-label="Footer">
      ${footerLinks}
    </nav>
  </footer>
</div>
</div>
</div>
<script type="application/json" id="holes-data">${JSON.stringify(holes.map((h) => h.slug))}</script>
<script src="/app.js?v=${ver}" defer></script>
</body>
</html>
`;
}

function newsletter() {
  if (!site.newsletterFormAction) return '';
  return `<section class="band" aria-labelledby="nl-title">
  <div class="wrap band-inner">
    <div>
      <h2 class="h2" id="nl-title">One new rabbit hole,<br><em>every Friday.</em></h2>
      <p class="lede">A single website worth losing your weekend to. No spam, one click to leave.</p>
    </div>
    <form class="signup" action="${esc(site.newsletterFormAction)}" method="post">
      <div class="field"><label for="nl-email">Email address</label><input class="input" id="nl-email" name="email" type="email" required autocomplete="email" placeholder="you@example.com"></div>
      <button class="btn btn-accent" type="submit">Subscribe</button>
    </form>
  </div>
</section>`;
}

function editorPicks() {
  const picks = curated.editorPicks || [];
  if (!picks.length) return '';
  const [lead, ...rest] = picks;
  return `<div class="section-head" style="margin-top:72px"><h3 class="h3">Fresh from the editors</h3></div>
<div class="picks">
  <a class="card pick-lead" href="${esc(lead.url)}">
    ${lead.image ? `<img class="media" src="${esc(lead.image)}" alt="${esc(lead.imageAlt || '')}">` : ''}
    <div class="body"><span class="eyebrow" style="margin:0">${esc(lead.kind || 'Feature')}</span><h3>${esc(lead.title)}</h3>${lead.desc ? `<p class="blurb">${esc(lead.desc)}</p>` : ''}</div>
  </a>
  ${rest.length ? `<div class="pick-side">${rest.slice(0, 3).map((p) => `<a class="card pick-row" href="${esc(p.url)}"><span style="display:flex;flex-direction:column;gap:4px"><span class="kind">${esc(p.kind || 'Pick')}</span><span class="title">${esc(p.title)}</span></span></a>`).join('')}</div>` : ''}
</div>`;
}

function home() {
  const f = bySlug[site.featuredSlug] || holes[0];
  const body = `<div class="wrap">
  <section class="hero">
    <div class="hero-main">
      <p class="eyebrow">Hand-picked websites · no algorithm</p>
      <h1 class="display">Pick a website.<br><em>Lose an evening.</em></h1>
      <p class="lede">Legendary internet rabbit holes: sites you open for a minute and close three hours later. Each one has a short guide on what it is, where to start, and how deep it goes.</p>
    </div>
    <div class="hero-cta">
      <button type="button" class="btn btn-accent btn-lg" data-random>Fall into a random one <span aria-hidden="true">↓</span></button>
      <div class="time-hero" role="group" aria-labelledby="time-q">
        <p id="time-q">How much time do you have?</p>
        ${TIMES.slice(1).map((t) => `<a class="btn btn-ghost time-jump" href="/?time=${t.id}#rabbit-holes" data-time-jump="${t.id}"><span>${t.label}</span><span class="hint">${t.hint}</span></a>`).join('')}
      </div>
    </div>
  </section>

  <section class="featured" aria-labelledby="feat-title">
    <div class="big-num">${pad(f.num)}</div>
    <div class="featured-body">
      <p class="eyebrow muted">This week’s hole · ${esc(f.cat)}</p>
      <h2 id="feat-title">${esc(f.name)}</h2>
      <p class="url">${esc(host(f.url))}</p>
      <p class="blurb">${esc(f.blurb)}</p>
    </div>
    <div class="featured-actions">
      <a class="btn btn-light" href="${holePath(f)}">Read the guide</a>
      <a class="btn btn-ghost" href="${esc(f.url)}" target="_blank" rel="noopener" data-visit="${f.slug}">Visit the site ↗</a>
    </div>
  </section>

  <section id="curated" class="section" aria-labelledby="cur-title">
    <div class="section-head">
      <div><p class="eyebrow">Curated</p><h2 class="h2" id="cur-title">Collections for the mood you’re in</h2></div>
    </div>
    <div class="grid">
      ${curated.collections.map((c) => `<a class="card" href="/collections/${slugify(c.title)}/">
        <span class="cat mono" style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)">${c.holes.length} holes · ${esc(c.tag)}</span>
        <h3>${esc(c.title)}</h3>
        <p class="blurb">${esc(c.desc)}</p>
        <span class="list">${c.holes.map((s) => esc(bySlug[s]?.name || s)).join(' · ')}</span>
      </a>`).join('\n      ')}
    </div>
    ${editorPicks()}
  </section>

  <section id="rabbit-holes" class="section" aria-labelledby="all-title">
    <div class="section-head">
      <h2 class="h2" id="all-title">All rabbit holes</h2>
      <div class="search"><label for="hole-search">Search the holes</label><input class="input" id="hole-search" type="search" placeholder="Try “maps” or “archive”"></div>
    </div>
    <div class="chips time-chips" role="group" aria-label="How much time do you have?">
      <span class="chips-label">Time</span>
      ${TIMES.map((t, i) => `<button type="button" class="chip" data-time="${t.id}" aria-pressed="${i === 0}">${t.label}</button>`).join('\n      ')}
    </div>
    <div class="chips cat-chips" role="group" aria-label="Filter by category">
      <span class="chips-label">Type</span>
      ${['All', ...CATS].map((c, i) => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${i === 0}">${esc(c)}</button>`).join('\n      ')}
    </div>
    <div class="list-meta"><p class="count-label" id="hole-count" aria-live="polite">Showing all</p><label class="hide-explored"><input type="checkbox" id="hide-explored"> Hide ones I’ve explored</label></div>
    <div class="grid" id="hole-grid">
      ${holes.map(card).join('\n')}
    </div>
    <p class="empty" id="hole-empty" hidden>No rabbit holes match that. Try another word or pick “All”.</p>
  </section>
</div>
${newsletter()}`;
  return page({
    path: '/', description: site.description, body,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'ItemList', name: 'Legendary Internet Rabbit Holes', url: site.url + '/',
      itemListElement: holes.map((h) => ({ '@type': 'ListItem', position: h.num, name: h.name, url: site.url + holePath(h) })),
    },
  });
}

function holePage(h, i) {
  const prev = holes[(i - 1 + holes.length) % holes.length];
  const next = holes[(i + 1) % holes.length];
  const related = holes.filter((x) => x.cat === h.cat && x.slug !== h.slug).sort((a, b) => b.depth - a.depth).slice(0, 3);
  const g = h.guide;
  const guide = g ? `<article class="article">
    ${g.what ? `<h2>What it is</h2>${g.what.map((p) => `<p>${esc(p)}</p>`).join('')}` : ''}
    ${g.start ? `<h2>Where to start</h2><ol class="steps">${g.start.map(([t, d]) => `<li><span><strong>${esc(t)}</strong> ${esc(d)}</span></li>`).join('')}</ol>` : ''}
    ${g.why ? `<h2>Why you won’t leave</h2><p>${esc(g.why)}</p>` : ''}
  </article>` : '';
  const facts = [
    `<div class="fact"><p class="k">DEPTH</p><div class="bar" aria-hidden="true"><i style="width:${h.depth * 20}%"></i></div><p class="v">${DEPTH[h.depth]}</p></div>`,
    `<div class="fact"><p class="k">CATEGORY</p><p class="v">${esc(h.cat)}</p></div>`,
    h.bestFor ? `<div class="fact"><p class="k">BEST FOR</p><p class="v">${esc(h.bestFor)}</p></div>` : '',
    h.cost ? `<div class="fact"><p class="k">COST</p><p class="v">${esc(h.cost)}</p></div>` : '',
  ].join('');
  const body = `<div class="wrap">
  <a class="back" href="/#rabbit-holes">← Back to all rabbit holes</a>
  <section class="hole-hero">
    <div class="main">
      <p class="eyebrow muted"><span style="color:var(--accent)">No. ${pad(h.num)}</span> · ${esc(h.cat)}</p>
      <h1 class="display">${esc(h.name)}</h1>
      <p class="lede">${esc(h.blurb)}</p>
    </div>
    <div class="cta">
      <a class="btn btn-accent btn-lg" href="${esc(h.url)}" target="_blank" rel="noopener" data-visit="${h.slug}">Visit ${esc(h.name)} <span aria-hidden="true">↗</span></a>
      <p>${esc(host(h.url))}</p>
      <button type="button" class="btn btn-ghost explore-toggle" data-explore-toggle="${h.slug}" aria-pressed="false"><span data-label>Mark as explored</span></button>
    </div>
  </section>
  <section class="facts" aria-label="At a glance">${facts}</section>
  ${guide}
  <section class="related" aria-labelledby="rel-title">
    <h2 class="h2" id="rel-title">If you liked this, fall into…</h2>
    <div class="grid">${related.map(card).join('')}</div>
  </section>
  <nav class="pager" aria-label="Previous and next">
    <a href="${holePath(prev)}" rel="prev">← No. ${pad(prev.num)} · ${esc(prev.name)}</a>
    <a href="${holePath(next)}" rel="next">No. ${pad(next.num)} · ${esc(next.name)} →</a>
  </nav>
</div>`;
  return page({
    title: `${h.name} — Rabbit hole No. ${pad(h.num)}`,
    description: `${h.blurb} A Modyrn Pulse guide to ${h.name} (${host(h.url)}).`,
    path: holePath(h), body, current: h,
    jsonld: { '@context': 'https://schema.org', '@type': 'WebPage', name: h.name, description: h.blurb, url: site.url + holePath(h), about: { '@type': 'WebSite', name: h.name, url: h.url } },
  });
}

function collectionPage(c) {
  const list = c.holes.map((s) => bySlug[s]).filter(Boolean);
  const path = `/collections/${slugify(c.title)}/`;
  const body = `<div class="wrap">
  <a class="back" href="/#curated">← All collections</a>
  <section class="hero" style="padding-top:48px">
    <div class="hero-main"><p class="eyebrow">Collection · ${esc(c.tag)}</p><h1 class="display">${esc(c.title)}</h1><p class="lede">${esc(c.desc)}</p></div>
  </section>
  <section class="section"><div class="grid">${list.map(card).join('')}</div></section>
</div>`;
  return { path, html: page({ title: c.title, description: `${c.desc} ${list.map((h) => h.name).join(', ')}.`, path, body }) };
}

function write(path, html) {
  const dir = join(OUT, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}

// Build
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, 'public'), OUT, { recursive: true });
cpSync(join(ROOT, 'src/styles.css'), join(OUT, 'styles.css'));
cpSync(join(ROOT, 'src/app.js'), join(OUT, 'app.js'));

const urls = ['/'];
write('/', home());
holes.forEach((h, i) => { write(holePath(h), holePage(h, i)); urls.push(holePath(h)); });
curated.collections.forEach((c) => { const p = collectionPage(c); write(p.path, p.html); urls.push(p.path); });
legal.forEach((l) => {
  const path = `/${l.slug}/`;
  write(path, page({ title: l.title, description: `${l.title} for ${site.name}.`, path, body: `<div class="wrap"><div class="prose"><h1>${esc(l.title)}</h1>${l.html}</div></div>` }));
  urls.push(path);
});

writeFileSync(join(OUT, '404.html'), page({
  title: 'Lost', description: 'This page fell down a rabbit hole.', path: '/404',
  body: `<div class="wrap"><section class="hero"><div class="hero-main"><p class="eyebrow">404</p><h1 class="display">This page fell<br><em>down a rabbit hole.</em></h1><p class="lede">Try one of these instead.</p></div><div class="hero-cta"><button type="button" class="btn btn-accent btn-lg" data-random>Random hole</button><a class="btn btn-ghost btn-lg" href="/">Back home</a></div></section></div>`,
}));

const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${site.url}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
const AI_BOTS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bytespider', 'meta-externalagent',
  'Meta-ExternalFetcher', 'Amazonbot', 'cohere-ai', 'Diffbot', 'DuckAssistBot', 'MistralAI-User', 'YouBot', 'Timpibot'];
// AI assistants and AI training crawlers are asked to stay out. Regular search engines are allowed.
writeFileSync(join(OUT, 'robots.txt'), `${AI_BOTS.map((b) => `User-agent: ${b}`).join('\n')}
Disallow: /

User-agent: *
Allow: /

Sitemap: ${site.url}/sitemap.xml
`);

console.log(`Built ${urls.length} pages into dist/`);
