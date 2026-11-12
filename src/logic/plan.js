// Planning des repas (logique pure, testée).
//
// Document plans/{premier jour de la semaine} :
//   { days: { "2026-11-07": { midi: [entrée…], midiP: […], soir: […], soirP: […] } } }
// Une entrée : { recipeId, title, servings, prep? } (recette) ou { text } (texte libre).
//   leftover : true — restes d'un plat (« Restes : Frittata »), from : { date, slotId } du repas d'origine.
//   prep : { offset, moment, done } — à préparer `offset` jours avant, le matin / midi / soir.
// Un jour peut aussi avoir :
//   order : ['task:t1', 'midiP', 'midi', 'prep:…', 'soir', 'soirP'] — ordre d'affichage des repas et tâches ce jour-là ;
//   tasks : [{ id, text, moment, done }] — tâches (« Sortir la viande »), pas des repas ;
//           ou { id, recipeId, title, servings, moment, done } — recette à préparer, repas pas encore choisi.
import { addDays, daysBetween, weekStart } from './dates.js';

export const SLOTS = [
  { id: 'midi', label: 'Midi', child: false },
  { id: 'midiP', label: 'Poupette', child: true },
  { id: 'soir', label: 'Soir', child: false },
  { id: 'soirP', label: 'Poupette', child: true },
];

export const DEFAULT_SETTINGS = { familyServings: 2, childServings: 1 };

export const QUICK_TEXTS = ['Restaurant', 'Chez Mamie', 'Pique-nique', 'Pizza', 'Sandwichs', 'Cantine', 'Repas libre'];

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
  const name = entry.text || recipesById?.get?.(entry.recipeId)?.title || entry.title || 'Recette supprimée';
  return entry.leftover ? `Restes : ${name}` : name;
}

const SLOT_RANK = { midi: 0, midiP: 1, soir: 2, soirP: 3 };

/**
 * Plats des jours précédents (et des repas plus tôt le même jour) dont on peut
 * manger les restes : du plus récent au plus ancien, sans doublon ni restes de restes.
 */
export function leftoverCandidates(plans, date, slotId, { days = 7 } = {}) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i <= days; i++) {
    const d = addDays(date, -i);
    const slots = SLOTS.filter((s) => i > 0 || SLOT_RANK[s.id] < SLOT_RANK[slotId]).reverse();
    for (const s of slots) {
      for (const e of slotEntries(plans, d, s.id)) {
        if (e.leftover || (e.text && QUICK_TEXTS.includes(e.text))) continue;
        const key = e.recipeId ? `r:${e.recipeId}` : `t:${(e.text || '').toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ date: d, slotId: s.id, entry: e });
      }
    }
  }
  return out;
}

/** Entrée « restes » d'un plat. */
export function leftoverOf(entry, from, servings) {
  const base = entry.recipeId ? { recipeId: entry.recipeId, title: entry.title || '', servings: servings ?? entry.servings ?? 1 } : { text: entry.text };
  return { ...base, leftover: true, from };
}

/** Restes déjà prévus d'un plat (repas qui pointent vers lui). */
export function leftoversFrom(plans, date, slotId, recipeId) {
  const out = [];
  for (const plan of Object.values(plans)) {
    for (const [d, day] of Object.entries(plan.days || {})) {
      for (const s of SLOTS) {
        for (const e of day?.[s.id] || []) {
          if (e.leftover && e.recipeId === recipeId && e.from?.date === date && e.from?.slotId === slotId) out.push({ date: d, slotId: s.id, entry: e });
        }
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || SLOT_RANK[a.slotId] - SLOT_RANK[b.slotId]);
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

/** Clé d'une tâche dans l'ordre d'un jour. */
export function taskKey(t) {
  return t.kind === 'prep' ? `prep:${t.mealDate}:${t.slotId}:${t.entry.recipeId}` : `task:${t.id ?? t.index}`;
}

/**
 * Lignes d'un jour, dans l'ordre choisi : repas (les 4, prévus ou non) et tâches.
 * Par défaut, les tâches du matin en haut, celles de midi avant Midi, celles du soir avant Soir.
 * Une ligne absente de l'ordre enregistré (nouvelle tâche…) prend sa place par défaut.
 * → [{ type: 'slot', key, id, filled } | { type: 'task', key, task }]
 */
export function dayItems(plans, date) {
  const day = plans[weekStart(date)]?.days?.[date] || {};
  const tasks = tasksOn(plans, date);
  const T = (m) => tasks.filter((t) => t.moment === m).map((task) => ({ type: 'task', key: taskKey(task), task }));
  const S = (id) => ({ type: 'slot', key: id, id, filled: (day[id] || []).length > 0 });
  const defaults = [...T('matin'), ...T('midi'), S('midi'), S('midiP'), ...T('soir'), S('soir'), S('soirP')];
  const byKey = new Map(defaults.map((i) => [i.key, i]));
  const result = [];
  for (const k of day.order || []) if (byKey.has(k) && !result.includes(byKey.get(k))) result.push(byKey.get(k));
  // Les lignes manquantes se placent juste avant la ligne qui les suit par défaut
  // (une tâche du soir avant Soir), en partant de la fin.
  for (let i = defaults.length - 1; i >= 0; i--) {
    const item = defaults[i];
    if (result.includes(item)) continue;
    const next = defaults.slice(i + 1).find((n) => result.includes(n));
    if (next) result.splice(result.indexOf(next), 0, item);
    else result.push(item);
  }
  return result;
}

/** Ordre des repas ce jour-là (ordre habituel si rien n'a été choisi). */
export function dayOrder(plans, date) {
  return dayItems(plans, date).filter((i) => i.type === 'slot').map((i) => i.id);
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
  const own = (plans[weekStart(date)]?.days?.[date]?.tasks || []).map((t, index) => ({ kind: t.recipeId ? 'prepAlone' : 'todo', index, ...t, moment: t.moment || 'matin', done: Boolean(t.done) }));
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
