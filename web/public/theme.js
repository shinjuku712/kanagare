// Applies the saved theme and UI size before the first paint, so the page
// doesn't flash. A file rather than an inline script so the CSP needs no hash.
(function () {
  try {
    var get = function (k) {
      return localStorage.getItem('kanagare_' + k);
    };
    var t = get('theme');
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#0a0a0c' : '#f1f1f4');
    var s = parseFloat(get('scale') || '1');
    if (s >= 0.8 && s <= 1.5) document.documentElement.style.setProperty('--ui-scale', String(s));
  } catch (e) {}
})();
