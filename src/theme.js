// Thème clair / sombre (préférence locale à l'appareil, non partagée).
const KEY = 'omq.theme';
const COLORS = { light: '#2F7D32', dark: '#141A15' };

export function getTheme() {
  try {
    return localStorage.getItem(KEY) || 'auto';
  } catch {
    return 'auto';
  }
}

function effective(theme) {
  if (theme === 'light' || theme === 'dark') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateMeta(theme) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[effective(theme)]);
}

export function applyTheme(theme) {
  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* stockage indisponible */
  }
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  updateMeta(theme);
}

export function initTheme() {
  updateMeta(getTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => updateMeta(getTheme()));
}
