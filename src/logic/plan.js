// Planning des repas et liste de courses (logique pure, testée).
//
// Document plans/{premier jour de la semaine} :
//   { days: { "2026-11-07": { midi: [entrée…], midiP: […], soir: […], soirP: […] } } }
// Une entrée : { recipeId, title, servings } (recette) ou { text } (texte libre).
import { aisleOrder, guessAisle, ingredientKey, isStaple } from './aisles.js';
import { daysBetween, weekStart } from './dates.js';
import { formatNumber, scaledQty, toBase, unitLabel } from './quantities.js';

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

// --- Liste de courses --------------------------------------------------------

/**
 * Additionne les ingrédients des recettes planifiées sur la période, aux
 * portions prévues. Retourne [{ key, name, amounts: [{ qty, unit }], aisle,
 * staple, recipes: [titres] }] trié par rayon puis par nom.
 */
export function buildShoppingList(entries, recipesById, { aisleOverrides = {} } = {}) {
  const items = new Map();
  for (const { entry } of entries) {
    if (!entry.recipeId) continue;
    const r = recipesById.get(entry.recipeId);
    if (!r || r.deleted) continue;
    const factor = r.servings && entry.servings ? entry.servings / r.servings : 1;
    for (const ing of r.ingredients || []) {
      if (ing.optional) continue;
      const key = ingredientKey(ing.name);
      if (!key) continue;
      let item = items.get(key);
      if (!item) {
        item = { key, name: ing.name, amounts: new Map(), counted: false, aisle: guessAisle(ing.name, aisleOverrides, key), staple: isStaple(ing.name), recipes: [] };
        items.set(key, item);
      }
      if (!item.recipes.includes(r.title)) item.recipes.push(r.title);
      const { qty } = scaledQty(ing, factor);
      if (qty === null) continue;
      const base = toBase(qty, ing.unit);
      const unit = base.unit || '';
      item.amounts.set(unit, (item.amounts.get(unit) || 0) + base.qty);
    }
  }
  return [...items.values()]
    .map((i) => ({ ...i, amounts: [...i.amounts.entries()].map(([unit, qty]) => ({ qty: roundBase(qty, unit), unit: unit || null })) }))
    .map(({ counted, ...i }) => i)
    .sort((a, b) => aisleOrder(a.aisle) - aisleOrder(b.aisle) || a.name.localeCompare(b.name, 'fr'));
}

function roundBase(qty, unit) {
  return Math.round(qty * 100) / 100;
}

/** Quantités lisibles : « 750 g », « 1,2 kg », « 2 sachets + 100 g ». */
export function formatAmounts(amounts = []) {
  return amounts.map(({ qty, unit }) => {
    if (unit === 'g' && qty >= 1000) return `${formatNumber(qty / 1000, 'kg')} kg`;
    if (unit === 'ml' && qty >= 1000) return `${formatNumber(qty / 1000, 'l')} l`;
    if (unit === 'ml' && qty >= 100) return `${formatNumber(qty / 10, 'cl')} cl`;
    return `${formatNumber(qty, unit)}${unit ? ` ${unitLabel(unit, qty)}` : ''}`;
  }).join(' + ');
}

/**
 * Nouvelle liste générée, en gardant ce qui a déjà été coché et les articles
 * ajoutés à la main. existing : articles actuels [{ id, key, checked, manual }].
 * Retourne { upserts: [article], removals: [id] }.
 */
export function mergeShopping(existing, generated) {
  const byKey = new Map(existing.filter((i) => !i.manual).map((i) => [i.key, i]));
  const upserts = generated.map((g) => {
    const old = byKey.get(g.key);
    return { ...g, id: old?.id || null, checked: old?.checked || false, manual: false, aisle: old?.aisleFixed ? old.aisle : g.aisle, aisleFixed: old?.aisleFixed || false };
  });
  const keep = new Set(generated.map((g) => g.key));
  const removals = existing.filter((i) => !i.manual && !keep.has(i.key)).map((i) => i.id);
  return { upserts, removals };
}

/** Liste en texte (partage par message). */
export function shoppingText(items, aisleLabel) {
  const lines = ['🛒 Liste de courses'];
  let current = null;
  for (const i of items.filter((x) => !x.checked)) {
    if (i.aisle !== current) {
      current = i.aisle;
      lines.push('', aisleLabel(current));
    }
    const q = formatAmounts(i.amounts);
    lines.push(`☐ ${i.name}${q ? ` — ${q}` : ''}`);
  }
  return lines.join('\n');
}
