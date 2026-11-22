(() => {
  const root = document.documentElement;
  const browserTheme = matchMedia('(prefers-color-scheme: dark)');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  let preference;

  try { preference = localStorage.getItem('schedule-theme'); } catch {}

  function paint() {
    const dark = preference === 'dark' || (preference !== 'light' && browserTheme.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    themeColor.content = dark ? '#171717' : '#ffffff';
  }

  paint();
  browserTheme.addEventListener('change', paint);
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('schedule-theme', preference); } catch {}
      paint();
    });
  });
})();
