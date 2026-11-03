// Routeur (#/chemin), barre d'onglets et porte de connexion.
import { h, setChildren } from './ui/dom.js';
import { icon } from './ui/icons.js';

/** @type {import('./data/store.js').Store} */
export let store;

export function setStore(s) {
  store = s;
}

const routes = [];
let current = null;
let gateView = null;

/**
 * Déclare une route : pattern '/recette/:id', vue (params, query) => Element ou { el, cleanup }.
 * options : tab (onglet actif, null = plein écran), live (re-rendu quand les données changent),
 * public (accessible sans connexion).
 */
export function route(pattern, view, { tab, live = false, public: isPublic = false } = {}) {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })}/?$`);
  routes.push({ re, keys, view, tab, live, isPublic });
}

/** Vues affichées tant que l'accès n'est pas confirmé (connexion, refus…). */
export function setGateView(fn) {
  gateView = fn;
}

export function navigate(path, { replace = false } = {}) {
  const hash = `#${path}`;
  if (replace) history.replaceState(null, '', hash);
  else if (location.hash !== hash) history.pushState(null, '', hash);
  render();
}

export function back(fallback = '/') {
  if (history.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

const TABS = [
  { id: 'week', href: '#/semaine', label: 'Semaine', icon: 'calendar' },
  { id: 'recipes', href: '#/', label: 'Recettes', icon: 'book' },
  { id: 'selection', href: '#/selection', label: 'Ma sélection', icon: 'bookmark', badge: () => store.selection?.length },
  { id: 'stats', href: '#/stats', label: 'Stats', icon: 'chart' },
  { id: 'more', href: '#/plus', label: 'Plus', icon: 'more' },
];

function tabbar(active) {
  return h('nav', { class: 'tabbar', 'aria-label': 'Navigation principale' },
    TABS.map((t) => h('a', {
      href: t.href,
      class: `tab ${active === t.id ? 'on' : ''}`,
      'aria-current': active === t.id ? 'page' : undefined,
    }, h('span', { class: 'tab-icon' }, icon(t.icon, 24), t.badge && h('span', { class: 'tab-badge', 'data-badge': t.id })),
    h('span', { class: 'tab-label' }, t.label))));
}

/** Pastille du nombre d'éléments (Ma sélection). */
function paintBadges() {
  for (const t of TABS) {
    const el = t.badge && document.querySelector(`[data-badge="${t.id}"]`);
    if (!el) continue;
    const n = t.badge() || 0;
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = !n;
  }
}

function mount(result, r, path) {
  const app = document.getElementById('app');
  if (current?.cleanup) current.cleanup();
  const el = result instanceof Node ? result : result.el;
  current = { cleanup: result.cleanup, path, route: r };
  setChildren(app, h('main', { class: 'view' }, el), r?.tab ? tabbar(r.tab) : null);
  app.classList.toggle('no-tabs', !r?.tab);
  paintBadges();
}

export function render() {
  const { path, query } = parse();
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    if (!r.isPublic && store.status !== 'ready') {
      mount(gateView(store), null, path);
      return;
    }
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const samePath = current?.path === path;
    mount(r.view(params, query), r, path);
    if (!samePath) window.scrollTo(0, 0);
    return;
  }
  navigate('/', { replace: true });
}

/** Re-rendu sans remonter en haut de page. */
export function refresh() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  store.subscribe((kind) => {
    if (kind === 'status') render();
    else if (kind === 'recipes' && current?.route?.live) refresh();
    else if (kind === 'selection') {
      paintBadges();
      if (current?.route?.live) refresh();
    }
  });
  render();
}
