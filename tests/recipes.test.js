import { describe, expect, it } from 'vitest';
import {
  allTags, cleanRecipe, filterRecipes, formatMinutes, formatRating, normalizeRating, normalizeText, starFills, validateRecipe,
} from '../src/logic/recipes.js';
import { cleanSource, detectSourceType, normalizeUrl, openLabel, sourceLabel, validateSource } from '../src/logic/sources.js';

const R = (title, extra = {}) => ({ id: title, title, source: { type: 'perso', title: 'Moi' }, ingredients: [], steps: [], tags: [], ...extra });

describe('sources', () => {
  it('reconnaît Cookidoo et Chronodrive', () => {
    expect(detectSourceType('https://cookidoo.fr/recipes/recipe/fr-FR/r123')).toBe('cookidoo');
    expect(detectSourceType('www.chronodrive.com/recettes/x')).toBe('chronodrive');
    expect(detectSourceType('marmiton.org/recettes/x')).toBe('web');
    expect(detectSourceType('pas une adresse')).toBe(null);
  });
  it('exige une source complète', () => {
    expect(validateSource(null)).toMatch(/source/);
    expect(validateSource({ type: 'livre' })).toMatch(/titre du livre/);
    expect(validateSource({ type: 'livre', title: 'Larousse', page: 'abc' })).toMatch(/page/);
    expect(validateSource({ type: 'web' })).toMatch(/lien/);
    expect(validateSource({ type: 'cookidoo', url: 'https://cookidoo.fr/r/1' })).toBe(null);
    expect(validateSource({ type: 'perso', title: 'Nadine' })).toBe(null);
  });
  it('nettoie et affiche', () => {
    expect(normalizeUrl('cookidoo.fr/r/1')).toBe('https://cookidoo.fr/r/1');
    expect(cleanSource({ type: 'livre', title: ' Larousse ', page: '42', url: '' })).toEqual({ type: 'livre', title: 'Larousse', page: 42 });
    expect(sourceLabel({ type: 'livre', title: 'Larousse', page: 42 })).toBe('Larousse, p. 42');
    expect(sourceLabel({ type: 'web', url: 'https://www.marmiton.org/x' })).toBe('marmiton.org');
    expect(openLabel({ type: 'cookidoo', url: 'https://cookidoo.fr/x' })).toBe('Ouvrir dans Cookidoo');
    expect(openLabel({ type: 'livre', title: 'x' })).toBe(null);
  });
});

describe('recettes', () => {
  it('nettoie les champs', () => {
    const r = cleanRecipe({
      title: '  Gratin ', servings: '4', prepMin: 'x', rating: 7, tags: ['Rapide', 'rapide', ''],
      ingredients: [{ name: 'lait', qty: '50', unit: 'cl' }, { name: '' }], steps: [{ text: ' ' }, { text: 'Cuire' }],
      source: { type: 'perso', title: 'Moi' }, category: 'inconnue', pirate: true,
    });
    expect(r).toEqual({
      title: 'Gratin', servings: 4, rating: 5, tags: ['rapide'], ingredients: [{ name: 'lait', qty: 50, unit: 'cl' }],
      steps: [{ text: 'Cuire' }], source: { type: 'perso', title: 'Moi' },
    });
    expect(validateRecipe(r)).toBe(null);
    expect(validateRecipe({ ...r, title: '' })).toMatch(/titre/);
  });
  it('cherche sans tenir compte des accents', () => {
    const list = [
      R('Bûche aux marrons'), R('Crème brûlée', { ingredients: [{ name: 'œufs' }] }), R('Gratin', { deleted: true }),
    ];
    expect(filterRecipes(list, { q: 'buche' }).map((r) => r.title)).toEqual(['Bûche aux marrons']);
    expect(filterRecipes(list, { q: 'oeufs' }).map((r) => r.title)).toEqual(['Crème brûlée']);
    expect(filterRecipes(list, {}).map((r) => r.title)).toEqual(['Bûche aux marrons', 'Crème brûlée']);
  });
  it('filtre et trie', () => {
    const list = [
      R('A', { category: 'plat', rating: 3, prepMin: 10, cookMin: 10, tags: ['rapide'] }),
      R('B', { category: 'dessert', rating: 5, prepMin: 60, source: { type: 'livre', title: 'L' } }),
      R('C', { rating: 4 }),
    ];
    expect(filterRecipes(list, { categories: ['plat'] }).map((r) => r.id)).toEqual(['A']);
    expect(filterRecipes(list, { minRating: 4, sort: 'rating' }).map((r) => r.id)).toEqual(['B', 'C']);
    expect(filterRecipes(list, { maxMinutes: 30 }).map((r) => r.id)).toEqual(['A']);
    expect(filterRecipes(list, { sourceTypes: ['livre'] }).map((r) => r.id)).toEqual(['B']);
    expect(filterRecipes(list, { uncategorized: true }).map((r) => r.id)).toEqual(['C']);
    expect(filterRecipes(list, { tags: ['rapide'] }).map((r) => r.id)).toEqual(['A']);
    expect(allTags(list)).toEqual(['rapide']);
  });
  it('affiche les durées', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(90)).toBe('1 h 30');
    expect(formatMinutes(120)).toBe('2 h');
    expect(normalizeText("L’Œuf")).toBe("l'oeuf");
  });
});

describe('demi-étoiles', () => {
  it('arrondit au demi-point et borne entre 0 et 5', () => {
    expect(normalizeRating(3.5)).toBe(3.5);
    expect(normalizeRating(3.3)).toBe(3.5);
    expect(normalizeRating(3.2)).toBe(3);
    expect(normalizeRating(9)).toBe(5);
    expect(normalizeRating(-1)).toBe(0);
    expect(normalizeRating('x')).toBe(0);
    expect(cleanRecipe({ title: 'a', rating: 4.5, source: { type: 'perso', title: 'Moi' } }).rating).toBe(4.5);
  });
  it('remplit les étoiles et affiche la note', () => {
    expect(starFills(3.5)).toEqual([1, 1, 1, 0.5, 0]);
    expect(starFills(0)).toEqual([0, 0, 0, 0, 0]);
    expect(formatRating(4.5)).toBe('4,5');
  });
  it('filtre avec une note minimale décimale', () => {
    const list = [{ id: 'a', title: 'A', rating: 3.5 }, { id: 'b', title: 'B', rating: 3 }];
    expect(filterRecipes(list, { minRating: 3.5 }).map((r) => r.id)).toEqual(['a']);
  });
});

describe('sources Quitoque et Thermomix (anciens tags)', () => {
  it('transforme #quitoque en source et retire #thermomix', async () => {
    const { sourceMigration, isThermomix } = await import('../src/logic/sources.js');
    expect(sourceMigration({ tags: ['quitoque', 'rapide'], source: { type: 'autre', title: 'Quitoque' } }))
      .toEqual({ tags: ['rapide'], source: { type: 'quitoque', title: 'Quitoque' } });
    expect(sourceMigration({ tags: ['thermomix'], source: { type: 'cookidoo', title: 'Cookidoo' } })).toEqual({ tags: [] });
    expect(sourceMigration({ tags: ['rapide'], source: { type: 'livre', title: 'X' } })).toBeNull();
    expect(isThermomix({ source: { type: 'livre' }, steps: [{ text: 'Mixer 5 sec/vitesse 5.' }] })).toBe(true);
    expect(isThermomix({ source: { type: 'quitoque' }, steps: [{ text: 'Cuire 10 min.' }] })).toBe(false);
  });
});
