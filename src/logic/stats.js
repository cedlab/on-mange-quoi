// Statistiques sur ce qu'on mange (logique pure, testée).
import { isThermomix } from './sources.js';
import { ingredientKey, isStaple } from './aisles.js';
import { addDays, daysBetween, fromISO, weekStart } from './dates.js';
import { SLOTS } from './plan.js';
import { normalizeText } from './recipes.js';
import { lastPlanned, seasonality } from './suggest.js';

const FAMILY_OF = { midiP: 'midi', soirP: 'soir' };

function countTop(map, n) {
  return [...map.entries()].sort((a, b) => b[1].count - a[1].count || String(a[0]).localeCompare(String(b[0]), 'fr')).slice(0, n).map(([key, v]) => ({ key, ...v }));
}

/**
 * Statistiques des repas entre from et to (jours au format ISO, inclus).
 * recipes : Map id → recette.
 */
export function computeStats({ plans = {}, recipes = new Map(), from, to }) {
  const days = daysBetween(from, to);
  let occasions = 0; // repas (créneaux remplis)
  let homemadeOccasions = 0;
  let dishes = 0;
  let recipeDishes = 0;
  let childOccasions = 0;
  let sameAsFamily = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let seasonalYes = 0;
  let seasonalAny = 0;
  const byRecipe = new Map();
  const byCategory = new Map();
  const bySource = new Map();
  const byText = new Map();
  const byIngredient = new Map();
  const byWeek = new Map();
  const byWeekday = new Map();
  for (const date of days) {
    const plan = plans[weekStart(date)]?.days?.[date] || {};
    const month = fromISO(date).getMonth() + 1;
    const week = weekStart(date);
    for (const slot of SLOTS) {
      const list = plan[slot.id] || [];
      if (!list.length) continue;
      occasions += 1;
      if (slot.child) {
        childOccasions += 1;
        const fam = new Set((plan[FAMILY_OF[slot.id]] || []).map((e) => e.recipeId).filter(Boolean));
        if (list.some((e) => e.recipeId && fam.has(e.recipeId))) sameAsFamily += 1;
      }
      if (list.some((e) => e.recipeId)) homemadeOccasions += 1;
      for (const e of list) {
        dishes += 1;
        byWeek.set(week, (byWeek.get(week) || 0) + 1);
        const wd = fromISO(date).getDay();
        byWeekday.set(wd, (byWeekday.get(wd) || 0) + 1);
        // Restes : un repas, mais pas une nouvelle fois où l'on cuisine la recette.
        if (e.leftover || (e.text && normalizeText(e.text) === 'restes')) {
          const cur = byText.get('restes') || { label: '♻️ Restes', count: 0 };
          cur.count += 1;
          byText.set('restes', cur);
          continue;
        }
        if (e.text) {
          const k = normalizeText(e.text);
          const cur = byText.get(k) || { label: e.text, count: 0 };
          cur.count += 1;
          byText.set(k, cur);
          continue;
        }
        if (!e.recipeId) continue;
        recipeDishes += 1;
        const r = recipes.get(e.recipeId);
        const cur = byRecipe.get(e.recipeId) || { label: r?.title || e.title || 'Recette supprimée', count: 0 };
        cur.count += 1;
        byRecipe.set(e.recipeId, cur);
        if (!r) continue;
        const cat = r.category || 'aucune';
        byCategory.set(cat, { count: (byCategory.get(cat)?.count || 0) + 1 });
        const src = r.source?.type || 'autre';
        bySource.set(src, { count: (bySource.get(src)?.count || 0) + 1 });
        if (r.rating) {
          ratingSum += r.rating;
          ratingCount += 1;
        }
        const s = seasonality(r, month);
        if (s.inSeason.length || s.outSeason.length) {
          seasonalAny += 1;
          if (s.inSeason.length >= s.outSeason.length) seasonalYes += 1;
        }
        const seen = new Set();
        for (const ing of r.ingredients || []) {
          const k = ingredientKey(ing.name);
          if (!k || seen.has(k) || isStaple(ing.name)) continue;
          seen.add(k);
          const c = byIngredient.get(k) || { label: ing.name.toLowerCase(), count: 0 };
          c.count += 1;
          byIngredient.set(k, c);
        }
      }
    }
  }
  const weeks = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) weeks.push({ week: w, count: byWeek.get(w) || 0 });
  return {
    days: days.length,
    occasions,
    dishes,
    recipeDishes,
    distinctRecipes: byRecipe.size,
    homemadeRate: occasions ? homemadeOccasions / occasions : null,
    childOccasions,
    sameAsFamily,
    avgRating: ratingCount ? ratingSum / ratingCount : null,
    seasonalRate: seasonalAny ? seasonalYes / seasonalAny : null,
    topRecipes: countTop(byRecipe, 10),
    categories: countTop(byCategory, 20),
    sources: countTop(bySource, 20),
    texts: countTop(byText, 8),
    ingredients: countTop(byIngredient, 10),
    weeks,
    weekdays: [6, 0, 1, 2, 3, 4, 5].map((d) => ({ day: d, count: byWeekday.get(d) || 0 })),
  };
}

/** Recettes bien notées pas au menu depuis longtemps (ou jamais). */
export function forgottenFavorites(recipes, plans, today, { minRating = 4, sinceDays = 90, limit = 6 } = {}) {
  const last = lastPlanned(plans);
  const limitDate = addDays(today, -sinceDays);
  return recipes
    .filter((r) => !r.deleted && (r.rating || 0) >= minRating)
    .map((r) => ({ recipe: r, last: last.get(r.id) || null }))
    .filter((x) => !x.last || x.last < limitDate)
    .sort((a, b) => (b.recipe.rating || 0) - (a.recipe.rating || 0) || (a.last || '').localeCompare(b.last || ''))
    .slice(0, limit);
}

/** Chiffres de la collection de recettes. */
export function collectionStats(recipes) {
  const active = recipes.filter((r) => !r.deleted);
  const rated = active.filter((r) => r.rating);
  return {
    total: active.length,
    withPhoto: active.filter((r) => r.thumb).length,
    categorized: active.filter((r) => r.category).length,
    rated: rated.length,
    avgRating: rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : null,
    thermomix: active.filter(isThermomix).length,
  };
}
