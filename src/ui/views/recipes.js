// Liste des recettes : recherche, filtres, tri.
import { store } from '../../app.js';
import {
  allTags, CATEGORIES, category, filterRecipes, formatMinutes, formatRating, starFills, totalMinutes,
} from '../../logic/recipes.js';
import { SOURCE_TYPES } from '../../logic/sources.js';
import { emptyState, header, segmented, sheet } from '../components.js';
import { h, plural, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { newRecipeMenu } from './paste.js';
import { bookmarkButton } from './selection.js';

const KEY = 'omq.recipeFilters';
const PAGE = 60;

function loadCriteria() {
  try {
    return { sort: 'az', ...JSON.parse(sessionStorage.getItem(KEY) || '{}') };
  } catch {
    return { sort: 'az' };
  }
}
let criteria = loadCriteria();
function saveCriteria() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(criteria));
  } catch {
    /* ignoré */
  }
}

export function recipeThumb(r, size = 64) {
  const style = { width: `${size}px`, height: `${size}px` };
  if (r.thumb) return h('img', { class: 'thumb', src: r.thumb, alt: '', style, loading: 'lazy', draggable: 'false' });
  const c = category(r.category);
  return h('div', { class: 'thumb thumb-empty', style: { ...style, fontSize: `${Math.round(size * 0.45)}px` }, 'aria-hidden': 'true' }, c?.emoji || '🍽️');
}

/** Étoiles en lecture seule (demi-étoiles comprises). */
export function stars(rating, size = 14) {
  if (!rating) return null;
  return h('span', { class: 'stars-view', style: { fontSize: `${size}px` }, role: 'img', 'aria-label': `${formatRating(rating)} sur 5` },
    starFills(rating).map((f) => h('span', { class: 'star-cell' }, '★',
      h('span', { class: 'star-fill', style: { width: `${f * 100}%` } }, '★'))));
}

function card(r) {
  const t = totalMinutes(r);
  const c = category(r.category);
  return h('a', { class: 'recipe-row', href: `#/recette/${r.id}` },
    recipeThumb(r, 64),
    h('div', { class: 'recipe-row-text' },
      h('strong', null, r.title),
      h('span', { class: 'recipe-row-meta' },
        c && h('span', null, c.label),
        t && h('span', null, '⏱ ', formatMinutes(t)),
        stars(r.rating, 12))),
    bookmarkButton(r, { className: 'row-end' }));
}

function activeFilterCount() {
  return (criteria.minRating ? 1 : 0) + (criteria.maxMinutes ? 1 : 0) + (criteria.sourceTypes?.length || 0)
    + (criteria.tags?.length || 0) + (criteria.uncategorized ? 1 : 0);
}

function filtersSheet(onChange) {
  const body = h('div', { class: 'stack' });
  const toggleIn = (key, value) => {
    const set = new Set(criteria[key] || []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    criteria[key] = [...set];
  };
  const chip = (label, on, onclick) => h('button', { type: 'button', class: `chip-select ${on ? 'on' : ''}`, onclick }, label);
  const draw = () => {
    const tags = allTags(store.activeRecipes);
    setChildren(body,
      h('div', { class: 'field' }, h('label', null, 'Trier par'),
        segmented([
          { value: 'az', label: 'A → Z' }, { value: 'rating', label: 'Note' },
          { value: 'time', label: 'Durée' }, { value: 'recent', label: 'Récentes' },
        ], criteria.sort || 'az', (v) => { criteria.sort = v; changed(); })),
      h('div', { class: 'field' }, h('label', null, 'Note minimale'),
        h('div', { class: 'chips' }, [0, 3, 3.5, 4, 4.5, 5].map((n) => chip(n ? `${formatRating(n)} ★${n < 5 ? ' et +' : ''}` : 'Toutes',
          (criteria.minRating || 0) === n, () => { criteria.minRating = n || undefined; changed(); })))),
      h('div', { class: 'field' }, h('label', null, 'Temps total maximum'),
        h('div', { class: 'chips' }, [0, 20, 30, 45, 60, 120].map((n) => chip(n ? formatMinutes(n) : 'Peu importe',
          (criteria.maxMinutes || 0) === n, () => { criteria.maxMinutes = n || undefined; changed(); })))),
      h('div', { class: 'field' }, h('label', null, 'Source'),
        h('div', { class: 'chips' }, SOURCE_TYPES.map((t) => chip(`${t.emoji} ${t.label}`, criteria.sourceTypes?.includes(t.id),
          () => { toggleIn('sourceTypes', t.id); changed(); })))),
      tags.length > 0 && h('div', { class: 'field' }, h('label', null, 'Tags'),
        h('div', { class: 'chips' }, tags.slice(0, 40).map((t) => chip(`#${t}`, criteria.tags?.includes(t),
          () => { toggleIn('tags', t); changed(); })))),
      h('div', { class: 'field' },
        chip('Sans catégorie seulement', criteria.uncategorized, () => { criteria.uncategorized = !criteria.uncategorized || undefined; changed(); })),
      h('button', {
        class: 'btn ghost', onclick: () => {
          criteria = { sort: 'az', q: criteria.q, categories: criteria.categories };
          changed();
        },
      }, 'Effacer les filtres'));
  };
  const changed = () => {
    saveCriteria();
    draw();
    onChange();
  };
  draw();
  sheet(body, { title: 'Filtres et tri' });
}

export function recipesView() {
  const results = h('div', { class: 'recipe-list' });
  const countEl = h('p', { class: 'small muted list-count' });
  const catChips = h('div', { class: 'filters' });
  const filterBtn = h('button', { class: 'icon-btn badge-host', 'aria-label': 'Filtres et tri', onclick: () => filtersSheet(update) }, icon('filter'));
  let observer = null;

  const search = h('input', {
    class: 'input search-input', type: 'search', placeholder: 'Rechercher (titre, ingrédient, source…)',
    value: criteria.q || '', autocomplete: 'off', enterkeyhint: 'search',
    oninput: () => {
      criteria.q = search.value;
      saveCriteria();
      update();
    },
  });

  function drawCats() {
    const selected = new Set(criteria.categories || []);
    setChildren(catChips,
      h('button', { class: `chip-select ${selected.size ? '' : 'on'}`, onclick: () => { criteria.categories = []; saveCriteria(); update(); } }, 'Tout'),
      CATEGORIES.map((c) => h('button', {
        class: `chip-select ${selected.has(c.id) ? 'on' : ''}`,
        onclick: () => {
          if (selected.has(c.id)) selected.delete(c.id);
          else selected.add(c.id);
          criteria.categories = [...selected];
          saveCriteria();
          update();
        },
      }, `${c.emoji} ${c.label}`)));
  }

  function update() {
    drawCats();
    const n = activeFilterCount();
    filterBtn.classList.toggle('has-badge', n > 0);
    filterBtn.dataset.badge = n || '';
    observer?.disconnect();
    if (!store.loaded) {
      setChildren(results, h('div', { class: 'spinner' }));
      countEl.textContent = '';
      return;
    }
    if (!store.activeRecipes.length) {
      countEl.textContent = '';
      setChildren(results, emptyState('📖', 'Aucune recette pour l’instant',
        'Ajoute ta première recette ou importe un fichier de recettes.',
        h('a', { class: 'btn primary', href: '#/recette/coller' }, '✨ Coller une recette'),
        h('a', { class: 'btn ghost', href: '#/recette/nouvelle' }, icon('plus', 20), 'Saisir à la main'),
        h('a', { class: 'btn ghost', href: '#/importer' }, icon('upload', 20), 'Importer des recettes')));
      return;
    }
    const list = filterRecipes(store.recipes, criteria);
    countEl.textContent = list.length === store.activeRecipes.length
      ? plural(list.length, 'recette', 'recettes')
      : `${plural(list.length, 'recette trouvée', 'recettes trouvées')} sur ${store.activeRecipes.length}`;
    if (!list.length) {
      setChildren(results, emptyState('🔎', 'Aucune recette ne correspond', 'Essaie un autre mot ou retire des filtres.'));
      return;
    }
    let shown = 0;
    setChildren(results);
    const sentinel = h('div', { class: 'sentinel' });
    const more = () => {
      const next = list.slice(shown, shown + PAGE);
      shown += next.length;
      sentinel.before(...next.map(card));
      if (shown >= list.length) observer?.disconnect();
    };
    results.append(sentinel);
    more();
    if (shown < list.length && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && more(), { rootMargin: '600px' });
      observer.observe(sentinel);
    } else {
      while (shown < list.length) more();
    }
  }

  const unsub = store.subscribe((kind) => kind === 'recipes' && update());
  update();

  const el = h('div', { class: 'page' },
    header('Recettes', {
      lead: h('a', { class: 'icon-btn dice-btn', href: '#/idee', 'aria-label': 'On mange quoi ? Une idée au hasard' }, icon('dice')),
      actions: [h('button', { class: 'icon-btn', 'aria-label': 'Ajouter une recette', onclick: newRecipeMenu }, icon('plus'))],
    }),
    h('div', { class: 'search-bar' }, h('div', { class: 'search-wrap' }, icon('search', 18), search), filterBtn),
    catChips,
    countEl,
    results);
  return { el, cleanup: () => { unsub(); observer?.disconnect(); } };
}
