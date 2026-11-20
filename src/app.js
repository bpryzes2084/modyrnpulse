(function () {
  var body = document.body;

  // ---------- Explored tracking (stored only in this browser) ----------
  var EKEY = 'mp-explored';
  var dataEl = document.getElementById('holes-data');
  var holes = dataEl ? JSON.parse(dataEl.textContent) : [];
  function loadExplored() {
    try { var a = JSON.parse(localStorage.getItem(EKEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  var explored = loadExplored().filter(function (s) { return holes.indexOf(s) !== -1; });
  function saveExplored() { try { localStorage.setItem(EKEY, JSON.stringify(explored)); } catch (e) {} }
  function isExplored(slug) { return explored.indexOf(slug) !== -1; }
  function setExplored(slug, on) {
    var has = isExplored(slug);
    if (on && !has) explored.push(slug);
    if (!on && has) explored.splice(explored.indexOf(slug), 1);
    saveExplored(); renderExplored();
  }
  function renderExplored() {
    var n = explored.length, total = holes.length;
    document.querySelectorAll('[data-slug]').forEach(function (el) {
      el.classList.toggle('is-explored', isExplored(el.dataset.slug));
    });
    document.querySelectorAll('[data-progress]').forEach(function (p) {
      p.textContent = n === 0 ? 'Open a site to start tracking what you’ve explored.'
        : n === total ? 'You’ve explored every single one. Legend.'
        : 'You’ve explored ' + n + '. ' + (total - n) + ' to go.';
    });
    document.querySelectorAll('[data-progress-bar]').forEach(function (b) { b.style.width = (total ? n / total * 100 : 0) + '%'; });
    document.querySelectorAll('[data-progress-reset]').forEach(function (b) { b.hidden = n === 0; });
    document.querySelectorAll('[data-explore-toggle]').forEach(function (b) {
      var on = isExplored(b.dataset.exploreToggle);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var l = b.querySelector('[data-label]'); if (l) l.textContent = on ? '✓ Explored' : 'Mark as explored';
    });
    if (applyFilters) applyFilters();
  }
  document.querySelectorAll('[data-visit]').forEach(function (a) {
    a.addEventListener('click', function () { setExplored(a.dataset.visit, true); });
    a.addEventListener('auxclick', function (e) { if (e.button === 1) setExplored(a.dataset.visit, true); });
  });
  document.querySelectorAll('[data-explore-toggle]').forEach(function (b) {
    b.addEventListener('click', function () { setExplored(b.dataset.exploreToggle, !isExplored(b.dataset.exploreToggle)); });
  });
  document.querySelectorAll('[data-progress-reset]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (window.confirm('Clear your explored list?')) { explored = []; saveExplored(); renderExplored(); }
    });
  });
  window.addEventListener('storage', function (e) { if (e.key === EKEY) { explored = loadExplored(); renderExplored(); } });

  // ---------- Side panel ----------
  var panel = document.getElementById('all-holes');
  var toggles = document.querySelectorAll('[data-panel-toggle]');
  var desktop = window.matchMedia('(min-width: 1024px)');
  var PKEY = 'mp-panel-hidden';
  function store(v) { try { localStorage.setItem(PKEY, v); } catch (e) {} }
  function stored() { try { return localStorage.getItem(PKEY); } catch (e) { return null; } }
  function isOpen() { return desktop.matches ? !panel.hidden : body.classList.contains('panel-open'); }
  function sync() {
    var open = isOpen();
    toggles.forEach(function (t) {
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
      var label = t.querySelector('[data-label]');
      if (label) label.textContent = open ? 'Hide list' : 'Show list';
    });
  }
  function setOpen(open) {
    if (desktop.matches) { panel.hidden = !open; store(open ? '0' : '1'); }
    else {
      panel.hidden = false;
      body.classList.toggle('panel-open', open);
      if (open) { var cur = panel.querySelector('[aria-current="page"]') || panel.querySelector('a'); if (cur) cur.focus(); }
    }
    sync();
  }
  if (panel) {
    if (desktop.matches && stored() === '1') panel.hidden = true;
    toggles.forEach(function (t) { t.addEventListener('click', function () { setOpen(!isOpen()); }); });
    document.querySelectorAll('[data-panel-close]').forEach(function (el) { el.addEventListener('click', function () { setOpen(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && body.classList.contains('panel-open')) setOpen(false); });
    desktop.addEventListener('change', function () { body.classList.remove('panel-open'); panel.hidden = stored() === '1' && desktop.matches; sync(); });
    var cur = panel.querySelector('[aria-current="page"]');
    if (cur && desktop.matches) cur.scrollIntoView({ block: 'center' });
    sync();
  }

  // ---------- Random hole: prefers ones you haven't explored ----------
  document.querySelectorAll('[data-random]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!holes.length) return;
      var here = location.pathname;
      var pool = holes.filter(function (s) { return !isExplored(s) && here.indexOf('/holes/' + s + '/') === -1; });
      if (!pool.length) pool = holes.filter(function (s) { return here.indexOf('/holes/' + s + '/') === -1; });
      location.href = '/holes/' + pool[Math.floor(Math.random() * pool.length)] + '/';
    });
  });

  // ---------- Homepage filters: time, type, search, hide explored ----------
  var applyFilters = null;
  var grid = document.getElementById('hole-grid');
  if (grid) {
    var TIME = { any: [1, 5], quick: [1, 2], hour: [3, 4], night: [5, 5] };
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.card'));
    var catChips = document.querySelectorAll('.cat-chips .chip');
    var timeChips = document.querySelectorAll('.time-chips .chip');
    var q = document.getElementById('hole-search');
    var hideEx = document.getElementById('hide-explored');
    var count = document.getElementById('hole-count');
    var empty = document.getElementById('hole-empty');
    var cat = 'All', time = 'any';
    applyFilters = function () {
      var term = (q.value || '').trim().toLowerCase(), n = 0, range = TIME[time] || TIME.any;
      cards.forEach(function (c) {
        var d = +c.dataset.depth;
        var ok = (cat === 'All' || c.dataset.cat === cat)
          && d >= range[0] && d <= range[1]
          && (!term || c.dataset.text.indexOf(term) !== -1)
          && !(hideEx.checked && isExplored(c.dataset.slug));
        c.hidden = !ok; if (ok) n++;
      });
      count.textContent = n === cards.length ? 'Showing all' : 'Showing ' + n + ' of ' + cards.length;
      empty.hidden = n !== 0;
    };
    var press = function (group, el) { group.forEach(function (o) { o.setAttribute('aria-pressed', o === el ? 'true' : 'false'); }); };
    var setTime = function (id) {
      time = TIME[id] ? id : 'any';
      timeChips.forEach(function (o) { o.setAttribute('aria-pressed', o.dataset.time === time ? 'true' : 'false'); });
      applyFilters();
    };
    catChips.forEach(function (ch) { ch.addEventListener('click', function () { cat = ch.dataset.cat; press(catChips, ch); applyFilters(); }); });
    timeChips.forEach(function (ch) { ch.addEventListener('click', function () { setTime(ch.dataset.time); }); });
    document.querySelectorAll('[data-time-jump]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        setTime(a.dataset.timeJump);
        history.replaceState(null, '', '/?time=' + time + '#rabbit-holes');
        document.getElementById('rabbit-holes').scrollIntoView({ behavior: 'smooth' });
      });
    });
    q.addEventListener('input', applyFilters);
    hideEx.addEventListener('change', applyFilters);
    var initial = new URLSearchParams(location.search).get('time');
    if (initial) setTime(initial);
  }

  renderExplored();
})();

// Newsletter sign-up: submit without leaving the page
(function () {
  document.querySelectorAll('[data-signup]').forEach(function (form) {
    var msg = form.querySelector('[data-signup-msg]');
    var btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      if (!window.fetch) return;
      e.preventDefault();
      btn.disabled = true; msg.classList.remove('is-error'); msg.textContent = 'Signing you up…';
      fetch(form.action, { method: 'POST', body: new FormData(form), headers: { accept: 'application/json' } })
        .then(function (r) { return r.json().catch(function () { return { ok: false, message: 'Something went wrong. Please try again.' }; }); })
        .then(function (d) {
          msg.textContent = d.message; msg.classList.toggle('is-error', !d.ok);
          if (d.ok) form.reset();
        })
        .catch(function () { msg.textContent = 'Couldn’t reach the server. Please try again.'; msg.classList.add('is-error'); })
        .then(function () { btn.disabled = false; });
    });
  });
})();
