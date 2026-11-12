// Planning des repas (logique pure, testée).
//
// Document plans/{premier jour de la semaine} :
//   { days: { "2026-11-07": { midi: [entrée…], midiP: […], soir: […], soirP: […] } } }
// Une entrée : { recipeId, title, servings, prep? } (recette) ou { text } (texte libre).
//   prep : { offset, moment, done } — à préparer `offset` jours avant, le matin / midi / soir.
// Un jour peut aussi avoir :
//   order : ['midiP', 'midi', 'soir', 'soirP'] — ordre d'affichage des repas ce jour-là ;
//   tasks : [{ id, text, moment, done }] — tâches (« Sortir la viande »), pas des repas.
import { addDays, daysBetween, weekStart } from './dates.js';

export const SLOTS = [
  { id: 'midi', label: 'Midi', child: false },
  { id: 'midiP', label: 'Poupette', child: true },
  { id: 'soir', label: 'Soir', child: false },
  { id: 'soirP', label: 'Poupette', child: true },
];

export const DEFAULT_SETTINGS = { familyServings: 2, childServings: 1 };

export const QUICK_TEXTS = ['Restes', 'Restaurant', 'Chez Mamie', 'Pique-nique', 'Pizza', 'Sandwichs', 'Cantine', 'Repas libre'];

/** Entrées d'un créneau. */
export function slotEntries(plans, date, slot) {
  const plan = plans[weekStart(date)];
  return plan?.days?.[date]?.[slot] || [];
}

/** Toutes les entrées de la période : [{ date, slot, entry }]. */
export function entriesBetween(plans, from, to) {
  const out = [];
  for (const date of daysBetween(from, to)) {
    for (const s of SLOTS) for (const entry of slotEntries(plans, date, s.id)) out.push({ date, slot: s.id, entry });
  }
  return out;
}

/** Libellé d'une entrée (titre à jour de la recette si elle existe encore). */
export function entryLabel(entry, recipesById) {
  if (entry.text) return entry.text;
  const r = recipesById?.get?.(entry.recipeId);
  return r?.title || entry.title || 'Recette supprimée';
}

/** Listes de plats d'un jour (sans l'ordre ni les tâches). */
export function mealLists(day) {
  return SLOTS.map((s) => day?.[s.id] || []);
}

/** Nombre de repas planifiés par jour (pastilles du calendrier). */
export function plannedDays(plans) {
  const days = new Set();
  for (const plan of Object.values(plans)) {
    for (const [date, day] of Object.entries(plan.days || {})) {
      if (mealLists(day).some((l) => l.length)) days.add(date);
    }
  }
  return days;
}

// --- Ordre des repas d'un jour ---------------------------------------------------

/** Ordre des repas ce jour-là (ordre habituel si rien n'a été choisi). */
export function dayOrder(plans, date) {
  const saved = (plans[weekStart(date)]?.days?.[date]?.order || []).filter((id) => SLOTS.some((s) => s.id === id));
  return [...new Set([...saved, ...SLOTS.map((s) => s.id)])];
}

/**
 * Seuls les repas prévus sont affichés : on en déplace un (de la position from à to
 * parmi ceux affichés) et les repas vides gardent leur place. Renvoie l'ordre complet.
 */
export function reorderShown(order, shown, from, to) {
  const moved = moveEntry(shown, from, to);
  const slots = order.map((id) => shown.includes(id));
  let k = 0;
  return order.map((id, i) => (slots[i] ? moved[k++] : id));
}

// --- Préparer à l'avance, tâches ----------------------------------------------------

export const MOMENTS = [
  { id: 'matin', label: 'Matin' },
  { id: 'midi', label: 'Midi' },
  { id: 'soir', label: 'Soir' },
];
const MOMENT_RANK = { matin: 0, midi: 1, soir: 2 };

/** « La veille au soir », « Le matin même », « 2 jours avant, midi »… */
export function prepLabel(prep) {
  const m = { matin: 'matin', midi: 'midi', soir: 'soir' }[prep.moment] || 'soir';
  if (prep.offset === 0) return m === 'matin' ? 'Le matin même' : `Le jour même, ${m}`;
  if (prep.offset === 1) return m === 'matin' ? 'La veille au matin' : m === 'midi' ? 'La veille à midi' : 'La veille au soir';
  return `${prep.offset} jours avant, ${m}`;
}

/** Repas à préparer à l'avance qui tombent ce jour-là (calculés depuis les repas : ils suivent un repas déplacé). */
export function prepTasksOn(plans, date) {
  const out = [];
  for (const plan of Object.values(plans)) {
    for (const [mealDate, day] of Object.entries(plan.days || {})) {
      for (const s of SLOTS) {
        (day?.[s.id] || []).forEach((entry, index) => {
          if (entry.prep && addDays(mealDate, -(entry.prep.offset || 0)) === date) {
            out.push({ kind: 'prep', mealDate, slotId: s.id, index, entry, moment: entry.prep.moment || 'soir', done: Boolean(entry.prep.done) });
          }
        });
      }
    }
  }
  return out;
}

/** Tâches du jour : préparations et tâches libres, du matin au soir. */
export function tasksOn(plans, date) {
  const own = (plans[weekStart(date)]?.days?.[date]?.tasks || []).map((t, index) => ({ kind: 'todo', index, ...t, moment: t.moment || 'matin', done: Boolean(t.done) }));
  return [...prepTasksOn(plans, date), ...own]
    .sort((a, b) => (MOMENT_RANK[a.moment] ?? 0) - (MOMENT_RANK[b.moment] ?? 0) || (a.mealDate || '').localeCompare(b.mealDate || ''));
}

/** Déplace l'élément de la position from à la position to. Nouvelle liste. */
export function moveEntry(list, from, to) {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list.slice();
  const out = list.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}
