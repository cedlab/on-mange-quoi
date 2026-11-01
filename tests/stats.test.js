import { describe, expect, it } from 'vitest';
import { collectionStats, computeStats, forgottenFavorites } from '../src/logic/stats.js';

const recipes = new Map([
  ['soupe', { id: 'soupe', title: 'Soupe de potiron', category: 'plat', rating: 4, source: { type: 'cookidoo' }, thumb: 't',
    ingredients: [{ name: 'Potiron' }, { name: 'Poireaux' }, { name: 'sel' }] }],
  ['salade', { id: 'salade', title: 'Salade de tomates', category: 'entree', source: { type: 'perso' },
    ingredients: [{ name: 'tomates' }, { name: 'huile d\'olive' }] }],
  ['gateau', { id: 'gateau', title: 'Gâteau', category: 'dessert', rating: 5, source: { type: 'livre' }, ingredients: [{ name: 'œufs' }] }],
]);

const plans = {
  '2026-10-31': { days: {
    '2026-10-31': { midi: [{ recipeId: 'soupe' }, { recipeId: 'gateau' }], midiP: [{ recipeId: 'soupe' }], soir: [{ text: 'Restes' }] },
    '2026-11-01': { soir: [{ recipeId: 'salade' }], soirP: [{ text: 'Purée' }] },
    '2026-11-03': { midi: [{ text: 'restes' }], soir: [{ recipeId: 'soupe' }] },
  } },
};

describe('statistiques', () => {
  const s = computeStats({ plans, recipes, from: '2026-10-31', to: '2026-11-06' });
  it('compte les repas et les plats', () => {
    expect(s).toMatchObject({ days: 7, occasions: 7, dishes: 8, recipeDishes: 5, distinctRecipes: 3, childOccasions: 2, sameAsFamily: 1 });
    expect(s.homemadeRate).toBeCloseTo(4 / 7);
    expect(s.avgRating).toBeCloseTo((4 + 5 + 4 + 4) / 4);
  });
  it('classe recettes, catégories, sources, textes et ingrédients', () => {
    expect(s.topRecipes[0]).toEqual({ key: 'soupe', label: 'Soupe de potiron', count: 3 });
    expect(s.categories.map((c) => [c.key, c.count])).toEqual([['plat', 3], ['dessert', 1], ['entree', 1]]);
    expect(s.sources[0]).toEqual({ key: 'cookidoo', count: 3 });
    expect(s.texts[0]).toEqual({ key: 'restes', label: 'Restes', count: 2 });
    expect(s.ingredients.map((i) => i.label)).toEqual(['poireaux', 'potiron', 'œufs', 'tomates']);
  });
  it('saison et semaines', () => {
    // soupe ×3 de saison en novembre/octobre, salade de tomates hors saison
    expect(s.seasonalRate).toBeCloseTo(3 / 4);
    expect(s.weeks).toEqual([{ week: '2026-10-31', count: 8 }]);
    expect(s.weekdays[0]).toEqual({ day: 6, count: 4 }); // samedi
  });
  it('période vide', () => {
    const e = computeStats({ plans, recipes, from: '2026-12-01', to: '2026-12-07' });
    expect(e).toMatchObject({ occasions: 0, homemadeRate: null, avgRating: null, topRecipes: [] });
  });
  it('favoris oubliés et collection', () => {
    const list = [...recipes.values()];
    expect(forgottenFavorites(list, plans, '2027-03-01').map((x) => x.recipe.id)).toEqual(['gateau', 'soupe']);
    expect(forgottenFavorites(list, plans, '2026-11-10').map((x) => x.recipe.id)).toEqual([]);
    expect(collectionStats(list)).toMatchObject({ total: 3, withPhoto: 1, categorized: 3, rated: 2, avgRating: 4.5, thermomix: 1 });
  });
});
