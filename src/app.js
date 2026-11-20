(function () {
  var body = document.body;
  var panel = document.getElementById('all-holes');
  var toggles = document.querySelectorAll('[data-panel-toggle]');
  var desktop = window.matchMedia('(min-width: 1024px)');
  var KEY = 'mp-panel-hidden';

  function store(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }

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

  // Random hole
  var dataEl = document.getElementById('holes-data');
  var holes = dataEl ? JSON.parse(dataEl.textContent) : [];
  document.querySelectorAll('[data-random]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!holes.length) return;
      var here = location.pathname, pick;
      do { pick = holes[Math.floor(Math.random() * holes.length)]; } while (holes.length > 1 && here.indexOf('/holes/' + pick + '/') !== -1);
      location.href = '/holes/' + pick + '/';
    });
  });

  // Filter + search on the homepage
  var grid = document.getElementById('hole-grid');
  if (grid) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.card'));
    var chips = document.querySelectorAll('.chip');
    var q = document.getElementById('hole-search');
    var count = document.getElementById('hole-count');
    var empty = document.getElementById('hole-empty');
    var cat = 'All';
    function apply() {
      var term = (q.value || '').trim().toLowerCase(), n = 0;
      cards.forEach(function (c) {
        var ok = (cat === 'All' || c.dataset.cat === cat) && (!term || c.dataset.text.indexOf(term) !== -1);
        c.hidden = !ok; if (ok) n++;
      });
      count.textContent = n === cards.length ? 'Showing all ' + n : 'Showing ' + n + ' of ' + cards.length;
      empty.hidden = n !== 0;
    }
    chips.forEach(function (ch) {
      ch.addEventListener('click', function () {
        cat = ch.dataset.cat;
        chips.forEach(function (o) { o.setAttribute('aria-pressed', o === ch ? 'true' : 'false'); });
        apply();
      });
    });
    q.addEventListener('input', apply);
  }
})();
