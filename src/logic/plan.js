// Planning des repas (logique pure, testée).
//
// Document plans/{premier jour de la semaine} :
//   { days: { "2026-11-07": { midi: [entrée…], midiP: […], soir: […], soirP: […] } } }
// Une entrée : { recipeId, title, servings } (recette) ou { text } (texte libre).
import { daysBetween, weekStart } from './dates.js';

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

/** Nombre de repas planifiés par jour (pastilles du calendrier). */
export function plannedDays(plans) {
  const days = new Set();
  for (const plan of Object.values(plans)) {
    for (const [date, slots] of Object.entries(plan.days || {})) {
      if (Object.values(slots || {}).some((l) => l?.length)) days.add(date);
    }
  }
  return days;
}
