// « Ma sélection » : les recettes (ou idées) qui tentent la famille, sans date.
// On les garde ici, puis on les met au menu de la semaine en deux touches.
import { navigate, store } from '../../app.js';
import { filterRecipes, normalizeText } from '../../logic/recipes.js';
import { emptyState, header, sheet, toast } from '../components.js';
import { h, plural, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { micButton } from '../voice.js';
import { planSheet } from './recipe.js';
import { recipeThumb } from './recipes.js';

/** « aujourd'hui », « hier », « il y a 3 jours », « il y a 2 semaines »… */
export function ago(ts, now = Date.now()) {
  if (!ts) return '';
  const d = new Date(ts);
  const n = new Date(now);
  const days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days <= 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  if (days < 14) return `il y a ${days} jours`;
  if (days < 60) return `il y a ${Math.round(days / 7)} semaines`;
  return `il y a ${Math.round(days / 30)} mois`;
}

export const selectionLabel = (item) => (item.recipeId ? store.recipe(item.recipeId)?.title || item.title || 'Recette supprimée' : item.text);

/** Toast après une mise au menu : l'élément quitte la sélection, avec « Garder » pour le remettre. */
export async function plannedFromSelection(item, where) {
  await store.removeSelection(item.id);
  toast(`Au menu : ${where}. Retiré de Ma sélection.`, { action: 'Garder', duration: 6000, onAction: () => store.restoreSelection(item) });
}

// --- Bouton 🔖 (liste, fiche recette, idée au hasard) ---------------------------

let syncing = false;
function syncButtons() {
  for (const b of document.querySelectorAll('[data-sel-recipe]')) paint(b, store.isSelected(b.dataset.selRecipe));
}
function paint(b, on) {
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
  const label = b.querySelector('.sel-label');
  if (label) label.textContent = on ? b.dataset.on : b.dataset.off;
}

/**
 * Bouton pour ajouter / retirer une recette de Ma sélection.
 * labels : { off, on } pour un bouton avec texte ; sinon une simple icône.
 */
export function bookmarkButton(r, { labels, className = '' } = {}) {
  if (!syncing) {
    syncing = true;
    store.subscribe((k) => k === 'selection' && syncButtons());
  }
  const b = h('button', {
    type: 'button',
    class: labels ? `btn ghost sel-btn ${className}` : `bookmark-btn ${className}`,
    'data-sel-recipe': r.id,
    'data-on': labels?.on, 'data-off': labels?.off,
    'aria-label': labels ? undefined : 'Ma sélection',
    onclick: async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const was = store.isSelected(r.id);
      paint(b, !was); // tout de suite, sans attendre la base
      try {
        const now = await store.toggleSelection(r);
        toast(now ? `« ${r.title} » ajoutée à Ma sélection.` : 'Retirée de Ma sélection.',
          now ? { action: 'Voir', onAction: () => navigate('/selection') } : { action: 'Annuler', onAction: () => store.toggleSelection(r) });
      } catch (err) {
        paint(b, was);
        toast(`Non enregistré : ${err.message}`);
      }
    },
  }, icon('bookmark', labels ? 20 : 22), labels && h('span', { class: 'sel-label' }));
  paint(b, store.isSelected(r.id));
  return b;
}

// --- Feuille « Ajouter une recette » --------------------------------------------

function pickRecipes() {
  const body = h('div', { class: 'stack' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Chercher une recette…', autocomplete: 'off', enterkeyhint: 'search', oninput: () => draw() });
  const results = h('div', { class: 'slot-results' });
  function draw() {
    const q = search.value;
    const list = normalizeText(q) ? filterRecipes(store.recipes, { q }).slice(0, 40)
      : [...store.activeRecipes].sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title, 'fr')).slice(0, 20);
    setChildren(results,
      list.map((r) => h('div', { class: 'slot-result' }, recipeThumb(r, 40), h('span', { class: 'grow' }, r.title), bookmarkButton(r))),
      !list.length && h('p', { class: 'muted small' }, 'Aucune recette trouvée.'));
  }
  setChildren(body, h('div', { class: 'row gap' }, search, micButton(search, { onFinal: draw })), results);
  draw();
  sheet(body, { title: 'Ajouter à Ma sélection', className: 'tall' });
  setTimeout(() => search.focus(), 250);
}

// --- Vue ------------------------------------------------------------------------

function itemCard(item) {
  const r = item.recipeId ? store.recipe(item.recipeId) : null;
  const gone = item.recipeId && (!r || r.deleted);
  const who = [item.addedByName && `par ${item.addedByName}`, ago(item.addedAt)].filter(Boolean).join(' · ');
  const thumb = r ? recipeThumb(r, 64) : h('span', { class: 'thumb thumb-empty', style: { width: '64px', height: '64px' } }, item.text ? '✏️' : '🍽️');
  const title = h('strong', null, selectionLabel(item));
  const remove = h('button', {
    class: 'icon-btn', 'aria-label': 'Retirer de Ma sélection', onclick: async () => {
      await store.removeSelection(item.id);
      toast('Retiré de Ma sélection.', { action: 'Annuler', onAction: () => store.restoreSelection(item) });
    },
  }, icon('close', 18));
  const link = (child) => (r && !gone ? h('a', { class: 'sel-link', href: `#/recette/${r.id}` }, child) : child);
  return h('div', { class: 'sel-item' },
    link(thumb),
    h('div', { class: 'recipe-row-text grow' },
      link(title),
      h('span', { class: 'recipe-row-meta' }, gone ? 'Recette à la corbeille' : `Ajouté ${who}`),
      !gone && h('button', {
        class: 'btn small primary sel-plan', onclick: () => planSheet(r, { text: item.text, onPlanned: (_d, _s, where) => plannedFromSelection(item, where) }),
      }, icon('calendar', 16), 'Mettre au menu')),
    remove);
}

export function selectionView() {
  const list = h('div', { class: 'stack tight sel-list' });
  const countEl = h('p', { class: 'count small muted' });

  const idea = h('input', { class: 'input grow', placeholder: 'Une idée : lasagnes, crêpes party…', autocomplete: 'off', enterkeyhint: 'done' });
  const form = h('form', {
    class: 'card stack tight', onsubmit: async (e) => {
      e.preventDefault();
      const t = idea.value.trim();
      if (!t) return;
      idea.value = '';
      try {
        await store.addSelectionText(t);
      } catch (err) {
        toast(`Non enregistré : ${err.message}`);
      }
    },
  },
  h('div', { class: 'row gap' }, idea, micButton(idea), h('button', { class: 'btn primary round-btn', type: 'submit', 'aria-label': 'Ajouter l’idée' }, icon('plus', 22))),
  h('button', { class: 'btn ghost', type: 'button', onclick: pickRecipes }, icon('book', 18), 'Choisir dans les recettes'));

  function draw() {
    if (!store.loaded) {
      setChildren(list, h('div', { class: 'spinner' }));
      return;
    }
    const items = store.selection;
    countEl.textContent = items.length ? plural(items.length, 'envie', 'envies') : '';
    setChildren(list, items.length
      ? items.map(itemCard)
      : emptyState('🔖', 'Rien de côté pour l’instant',
        'Touche 🔖 sur une recette qui te tente, ou écris une idée ci-dessus. Tu la mettras au menu le jour venu.'));
  }

  const unsub = store.subscribe((k) => (k === 'selection' || k === 'recipes') && draw());
  draw();
  return {
    el: h('div', { class: 'page' },
      header('Ma sélection'),
      h('p', { class: 'small muted pad-x sel-intro' }, 'Les recettes qui vous tentent, sans date. Mettez-les au menu quand vous voulez.'),
      h('div', { class: 'stack' }, form, countEl, list)),
    cleanup: unsub,
  };
}
