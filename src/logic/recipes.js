// Recettes : catégories, validation, recherche, filtres et tri (logique pure).
import { cleanSource, validateSource } from './sources.js';

export const CATEGORIES = [
  { id: 'aperitif', label: 'Apéritif', emoji: '🥂' },
  { id: 'entree', label: 'Entrée', emoji: '🥗' },
  { id: 'plat', label: 'Plat', emoji: '🍲' },
  { id: 'accompagnement', label: 'Accompagnement', emoji: '🥔' },
  { id: 'dessert', label: 'Dessert', emoji: '🍰' },
  { id: 'gouter', label: 'Goûter / petit-déj', emoji: '🥐' },
  { id: 'sauce', label: 'Sauce / base', emoji: '🥫' },
  { id: 'boisson', label: 'Boisson', emoji: '🍹' },
  { id: 'bebe', label: 'Poupette', emoji: '🍼' },
];

const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const category = (id) => CAT[id] || null;

/** Minuscules, sans accents ni ligatures : pour comparer et chercher. */
export function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .trim();
}

export function totalMinutes(r) {
  const t = (r.prepMin || 0) + (r.cookMin || 0) + (r.restMin || 0);
  return t || null;
}

export function formatMinutes(min) {
  if (!min) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

// --- Notes en étoiles (demi-étoiles comprises) --------------------------------

export const MAX_STARS = 5;

/** Note ramenée entre 0 et 5, au demi-point près. */
export function normalizeRating(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_STARS, Math.round(n * 2) / 2);
}

/** Remplissage de chaque étoile (1, 0,5 ou 0) pour l'affichage. */
export function starFills(rating) {
  const r = normalizeRating(rating);
  return Array.from({ length: MAX_STARS }, (_, i) => Math.max(0, Math.min(1, r - i)));
}

/** « 3,5 » */
export function formatRating(rating) {
  return String(normalizeRating(rating)).replace('.', ',');
}

const int = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Champs gérés d'une recette ; tout le reste est ignoré à l'enregistrement. */
export function cleanRecipe(input) {
  const r = {
    title: String(input.title || '').trim(),
    source: cleanSource(input.source || {}),
    ingredients: (input.ingredients || []).filter((i) => i && String(i.name || '').trim()).map(cleanIngredient),
    steps: (input.steps || [])
      .filter((s) => s && (String(s.text || '').trim() || String(s.section || '').trim()))
      .map((s) => (s.section ? { section: String(s.section).trim() } : { text: String(s.text).trim() })),
    tags: [...new Set((input.tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))],
    rating: normalizeRating(input.rating),
  };
  for (const k of ['servings', 'prepMin', 'cookMin', 'restMin']) {
    const v = int(input[k]);
    if (v) r[k] = v;
  }
  const label = String(input.servingsLabel || '').trim();
  if (label) r.servingsLabel = label;
  if (input.category && CAT[input.category]) r.category = input.category;
  const notes = String(input.notes || '').trim();
  if (notes) r.notes = notes;
  if (input.origin && typeof input.origin === 'object') r.origin = input.origin;
  return r;
}

function cleanIngredient(i) {
  const out = { name: String(i.name).trim() };
  const q = Number(i.qty);
  if (i.qty !== undefined && i.qty !== null && Number.isFinite(q) && q > 0) out.qty = q;
  const qm = Number(i.qtyMax);
  if (out.qty && i.qtyMax !== undefined && i.qtyMax !== null && Number.isFinite(qm) && qm > out.qty) out.qtyMax = qm;
  for (const k of ['unit', 'note', 'group', 'raw']) {
    const v = String(i[k] ?? '').trim();
    if (v) out[k] = v;
  }
  if (i.optional) out.optional = true;
  return out;
}

/** Erreur lisible ou null. */
export function validateRecipe(r) {
  if (!r.title) return 'Donne un titre à la recette.';
  return validateSource(r.source);
}

// --- Recherche, filtres, tri ---------------------------------------------------

/** Texte indexé : titre, ingrédients, tags, source. */
export function searchText(r) {
  return normalizeText([
    r.title,
    ...(r.ingredients || []).map((i) => i.name),
    ...(r.tags || []),
    r.source?.title,
    r.source?.author,
    r.notes,
  ].filter(Boolean).join(' \u0001 '));
}

/**
 * Filtre et trie.
 * criteria : { q, categories[], tags[], minRating, maxMinutes, sourceTypes[], sort, uncategorized }
 * sort : 'az' | 'rating' | 'recent' | 'time'
 */
export function filterRecipes(recipes, criteria = {}) {
  const words = normalizeText(criteria.q).split(/\s+/).filter(Boolean);
  const cats = new Set(criteria.categories || []);
  const tags = criteria.tags || [];
  const types = new Set(criteria.sourceTypes || []);
  const list = recipes.filter((r) => {
    if (r.deleted) return false;
    if (cats.size && !cats.has(r.category)) return false;
    if (criteria.uncategorized && r.category) return false;
    if (tags.length && !tags.every((t) => (r.tags || []).includes(t))) return false;
    if (criteria.minRating && (r.rating || 0) < criteria.minRating) return false;
    if (criteria.maxMinutes) {
      const t = totalMinutes(r);
      if (!t || t > criteria.maxMinutes) return false;
    }
    if (types.size && !types.has(r.source?.type)) return false;
    if (words.length) {
      const text = r._search ?? searchText(r);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
  const sorters = {
    az: byTitle,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || byTitle(a, b),
    recent: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) || byTitle(a, b),
    time: (a, b) => (totalMinutes(a) || 1e9) - (totalMinutes(b) || 1e9) || byTitle(a, b),
  };
  // Recherche : les titres qui correspondent passent devant.
  if (words.length && (!criteria.sort || criteria.sort === 'az')) {
    const inTitle = (r) => words.every((w) => normalizeText(r.title).includes(w));
    return list.sort((a, b) => Number(inTitle(b)) - Number(inTitle(a)) || byTitle(a, b));
  }
  return list.sort(sorters[criteria.sort] || byTitle);
}

/** Tous les tags utilisés, du plus fréquent au moins fréquent. */
export function allTags(recipes) {
  const count = new Map();
  for (const r of recipes) if (!r.deleted) for (const t of r.tags || []) count.set(t, (count.get(t) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map(([t]) => t);
}
