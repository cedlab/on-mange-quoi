// « On mange quoi ? » : une recette tirée au hasard, de saison, pas mangée
// récemment et plutôt bien notée — avec une petite animation de tirage.
import { store } from '../../app.js';
import { todayISO } from '../../logic/dates.js';
import { category, formatMinutes, totalMinutes } from '../../logic/recipes.js';
import { monthLabel, suggest } from '../../logic/suggest.js';
import { emptyState, header } from '../components.js';
import { h, setChildren, vibrate } from '../dom.js';
import { icon } from '../icons.js';
import { photoCache, planSheet } from './recipe.js';
import { recipeThumb, stars } from './recipes.js';
import { bookmarkButton } from './selection.js';

const KEY = 'omq.ideaFilters';
const CATS = [
  { id: null, label: 'Tout' }, { id: 'plat', label: '🍲 Plat' }, { id: 'entree', label: '🥗 Entrée' },
  { id: 'dessert', label: '🍰 Dessert' }, { id: 'aperitif', label: '🥂 Apéro' }, { id: 'gouter', label: '🥐 Goûter' },
  { id: 'bebe', label: '🍼 Poupette' },
];

function load() {
  try {
    return { season: true, ...JSON.parse(sessionStorage.getItem(KEY) || '{}') };
  } catch {
    return { season: true };
  }
}
let filters = load();
const save = () => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(filters));
  } catch {
    /* ignoré */
  }
};

export function ideaView() {
  const today = todayISO();
  const body = h('div', { class: 'stack idea' });
  const seen = [];
  let current = null;
  let alternatives = [];
  let rolling = false;

  const criteria = () => ({ ...filters, categories: filters.category ? [filters.category] : [] });

  function roll() {
    if (rolling) return;
    const picks = suggest(store.recipes, { plans: store.plans, today, filters: criteria(), count: 4, exclude: seen.slice(-30) });
    if (!picks.length && seen.length) {
      seen.length = 0; // tout a été vu : on recommence
      return roll();
    }
    if (!picks.length) {
      current = null;
      alternatives = [];
      draw();
      return;
    }
    const [first, ...rest] = picks;
    seen.push(first.recipe.id);
    // Animation : quelques titres défilent puis la roue s'arrête.
    const pool = store.activeRecipes;
    rolling = true;
    let n = 0;
    const steps = [60, 60, 70, 80, 90, 110, 130, 160, 200, 250];
    const tick = () => {
      if (n >= steps.length) {
        rolling = false;
        current = first;
        alternatives = rest.slice(0, 3);
        vibrate(20);
        draw();
        return;
      }
      const r = pool[Math.floor(Math.random() * pool.length)];
      drawRolling(r);
      setTimeout(tick, steps[n++]);
    };
    tick();
  }

  function filterBar() {
    const toggle = (key, label) => h('button', {
      class: `chip-select ${filters[key] ? 'on' : ''}`,
      onclick: () => { filters[key] = !filters[key]; save(); seen.length = 0; roll(); },
    }, label);
    return h('div', { class: 'stack tight' },
      h('div', { class: 'filters' }, CATS.map((c) => h('button', {
        class: `chip-select ${(filters.category || null) === c.id ? 'on' : ''}`,
        onclick: () => { filters.category = c.id; save(); seen.length = 0; roll(); },
      }, c.label))),
      h('div', { class: 'filters' },
        toggle('season', '🌱 De saison'), toggle('quick', '⏱ Rapide'), toggle('wellRated', '⭐ Bien notées'), toggle('thermomix', '🥣 Thermomix')));
  }

  function drawRolling(r) {
    setChildren(body, filterBar(),
      h('div', { class: 'idea-card rolling' },
        h('div', { class: 'idea-photo' }, recipeThumb(r, 120)),
        h('h2', { class: 'idea-title' }, r.title)),
      h('button', { class: 'btn primary big', disabled: true }, '🎲 …'));
  }

  function draw() {
    if (!store.loaded) {
      setChildren(body, h('div', { class: 'spinner' }));
      return;
    }
    if (!current) {
      setChildren(body, filterBar(), emptyState('🤷', 'Aucune recette ne correspond', 'Retire un filtre pour élargir le tirage.'));
      return;
    }
    const r = current.recipe;
    const t = totalMinutes(r);
    const c = category(r.category);
    const photo = h('div', { class: 'idea-photo' }, photoCache.get(r.id) ? h('img', { src: photoCache.get(r.id), alt: '' }) : recipeThumb(r, 120));
    if (!photoCache.get(r.id) && r.thumb) {
      store.getPhoto(r.id).then((data) => {
        if (!data) return;
        photoCache.set(r.id, data);
        if (current?.recipe.id === r.id) setChildren(photo, h('img', { src: data, alt: '' }));
      }).catch(() => {});
    }
    setChildren(body,
      filterBar(),
      h('div', { class: 'idea-card' },
        photo,
        h('h2', { class: 'idea-title' }, r.title),
        h('div', { class: 'recipe-row-meta center' }, c && h('span', null, `${c.emoji} ${c.label}`), t && h('span', null, `⏱ ${formatMinutes(t)}`), stars(r.rating, 14)),
        current.reasons.length > 0 && h('ul', { class: 'idea-reasons' }, current.reasons.slice(0, 4).map((x) => h('li', null, x)))),
      h('button', { class: 'btn primary big', onclick: roll }, '🎲 Une autre idée'),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost grow', onclick: () => planSheet(r) }, icon('calendar', 18), 'Planifier'),
        h('a', { class: 'btn ghost grow', href: `#/recette/${r.id}` }, icon('book', 18), 'Voir la recette')),
      bookmarkButton(r, { labels: { off: 'Garder pour plus tard', on: 'Dans Ma sélection' } }),
      alternatives.length > 0 && h('section', { class: 'stack tight' },
        h('h3', { class: 'idea-alt-title' }, 'Ou bien…'),
        h('div', { class: 'recipe-list flush' }, alternatives.map((a) => h('a', { class: 'recipe-row', href: `#/recette/${a.recipe.id}` },
          recipeThumb(a.recipe, 52),
          h('div', { class: 'recipe-row-text' }, h('strong', null, a.recipe.title),
            a.reasons[0] && h('span', { class: 'recipe-row-meta' }, a.reasons[0])))))));
  }

  const unsub = store.subscribe((k) => {
    if (k === 'recipes' && !current && !rolling) roll();
  });
  if (store.loaded) roll();
  else draw();
  return {
    el: h('div', { class: 'page' },
      header('On mange quoi ?', { back: '#/' }),
      h('p', { class: 'small muted center-text idea-sub' }, `Idées de saison pour ${monthLabel(today)}, pas mangées récemment`),
      body),
    cleanup: unsub,
  };
}
