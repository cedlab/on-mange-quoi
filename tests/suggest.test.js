import { describe, expect, it } from 'vitest';
import { candidates, lastPlanned, scoreRecipe, seasonality, suggest } from '../src/logic/suggest.js';

const R = (id, title, ingredients = [], extra = {}) => ({ id, title, ingredients: ingredients.map((name) => ({ name })), tags: [], ...extra });

/** Hasard reproductible. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('saison', () => {
  it('reconnaît les légumes de saison et hors saison', () => {
    const soupe = R('a', 'Velouté', ['Potiron', 'Poireaux', 'Pommes de terre', 'crème fraîche']);
    expect(seasonality(soupe, 11)).toEqual({ inSeason: ['potiron', 'poireaux'], outSeason: [] });
    expect(seasonality(soupe, 7)).toEqual({ inSeason: [], outSeason: ['potiron', 'poireaux'] });
    const tarte = R('b', 'Tarte', ['tomates', 'courgettes', 'concentré de tomate', 'noix de coco râpée']);
    expect(seasonality(tarte, 1)).toEqual({ inSeason: [], outSeason: ['tomates', 'courgettes'] });
    expect(seasonality(R('c', 'x', ['Champignons de Paris', 'petits pois']), 11)).toEqual({ inSeason: [], outSeason: ['petits pois'] });
  });

  it('préfère les plats réconfortants en hiver, frais en été, et les fêtes', () => {
    const ctx = (month) => ({ month, today: `2026-${String(month).padStart(2, '0')}-15` });
    const gratin = R('g', 'Gratin dauphinois', ['pommes de terre']);
    const salade = R('s', 'Salade niçoise', ['tomates', 'haricots verts']);
    expect(scoreRecipe(gratin, ctx(12)).score).toBeGreaterThan(scoreRecipe(gratin, ctx(7)).score);
    expect(scoreRecipe(salade, ctx(7)).score).toBeGreaterThan(scoreRecipe(salade, ctx(12)).score);
    expect(scoreRecipe(R('b', 'Bûche aux marrons', ['crème de marrons']), ctx(12)).reasons).toContain('🎄 C’est bientôt Noël');
    expect(scoreRecipe(R('c', 'Crêpes', ['farine']), ctx(2)).reasons).toContain('🥞 Chandeleur et Mardi gras');
    expect(scoreRecipe(salade, { ...ctx(12), season: false }).score).toBe(0);
    // Une préparation de base passe derrière un vrai plat.
    expect(scoreRecipe(R('x', 'Ganache au chocolat pour macarons'), ctx(12)).score).toBeLessThan(scoreRecipe(gratin, ctx(12)).score - 3);
  });
});

describe('historique et notes', () => {
  const plans = {
    '2026-10-31': { days: { '2026-10-31': { midi: [{ recipeId: 'recente' }] }, '2026-11-05': { soir: [{ recipeId: 'prevue' }] } } },
    '2026-08-01': { days: { '2026-08-01': { soir: [{ recipeId: 'ancienne' }, { recipeId: 'recente' }] } } },
  };
  const today = '2026-11-02';
  const last = lastPlanned(plans);
  it('dernière date de chaque recette', () => {
    expect(last.get('recente')).toBe('2026-10-31');
    expect(last.get('ancienne')).toBe('2026-08-01');
  });
  it('écarte les recettes mangées récemment ou déjà prévues, valorise les oubliées et les bien notées', () => {
    const s = (r) => scoreRecipe(r, { month: 11, today, last, season: false });
    expect(s(R('recente', 'A')).reasons).toContain('🔁 Au menu ces 3 dernières semaines');
    expect(s(R('prevue', 'B')).reasons).toContain('📅 Déjà prévue prochainement');
    expect(s(R('recente', 'A')).score).toBeLessThan(-5);
    expect(s(R('ancienne', 'C')).reasons).toContain('⏳ Pas au menu depuis 3 mois');
    expect(s(R('top', 'D', [], { rating: 4.5 })).reasons).toContain('⭐ 4,5 / 5');
  });
});

describe('tirage', () => {
  const recipes = [
    R('1', 'Soupe de potiron', ['potiron', 'poireau'], { category: 'plat', rating: 4, prepMin: 20 }),
    R('2', 'Salade de tomates', ['tomates'], { category: 'entree', prepMin: 10 }),
    R('3', 'Blanquette', ['veau', 'champignons'], { category: 'plat', prepMin: 30, cookMin: 90, tags: ['thermomix'] }),
    R('4', 'Mousse au chocolat', ['chocolat'], { category: 'dessert', rating: 2 }),
    R('5', 'Supprimée', [], { deleted: true }),
  ];
  it('filtre', () => {
    expect(candidates(recipes, { categories: ['plat'] }).map((r) => r.id)).toEqual(['1', '3']);
    expect(candidates(recipes, { quick: true }).map((r) => r.id)).toEqual(['1', '2']);
    expect(candidates(recipes, { wellRated: true }).map((r) => r.id)).toEqual(['1']);
    expect(candidates(recipes, { thermomix: true }).map((r) => r.id)).toEqual(['3']);
  });
  it('tire sans doublon et sans les exclus', () => {
    const out = suggest(recipes, { today: '2026-11-15', count: 10, rng: seeded(3), exclude: ['4'] });
    expect(out.map((o) => o.recipe.id).sort()).toEqual(['1', '2', '3']);
  });
  it('favorise la saison sans exclure le reste', () => {
    const counts = {};
    const rng = seeded(7);
    for (let i = 0; i < 400; i++) {
      const [first] = suggest(recipes.slice(0, 2), { today: '2026-11-15', count: 1, rng });
      counts[first.recipe.id] = (counts[first.recipe.id] || 0) + 1;
    }
    expect(counts['1']).toBeGreaterThan(counts['2'] * 5); // potiron en novembre ≫ tomates
    expect(counts['2']).toBeGreaterThan(0);
  });
});
