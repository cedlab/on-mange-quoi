import { describe, expect, it } from 'vitest';
import { ingredientKey, isStaple } from '../src/logic/aisles.js';
import {
  addDays, daysBetween, formatDDMM, formatRange, monthGrid, weekDays, weekStart, weeksBetween,
} from '../src/logic/dates.js';
import { entriesBetween, entryLabel, plannedDays, slotEntries } from '../src/logic/plan.js';

describe('dates', () => {
  it('semaines du samedi au vendredi', () => {
    expect(weekStart('2026-09-05')).toBe('2026-09-05'); // samedi
    expect(weekStart('2026-09-11')).toBe('2026-09-05'); // vendredi
    expect(weekStart('2026-09-12')).toBe('2026-09-12');
    expect(weekDays('2026-09-05')).toEqual(['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // passage à l'heure d'été
  });
  it('périodes', () => {
    expect(daysBetween('2026-09-07', '2026-09-05')).toEqual(['2026-09-05', '2026-09-06', '2026-09-07']);
    expect(weeksBetween('2026-09-10', '2026-09-14')).toEqual(['2026-09-05', '2026-09-12']);
  });
  it('affichage comme le menu papier', () => {
    expect(formatRange('2026-09-05', '2026-09-11')).toBe('du 5 au 11 septembre 2026');
    expect(formatRange('2026-09-26', '2026-10-02')).toBe('du 26 septembre au 2 octobre 2026');
    expect(formatRange('2026-12-26', '2027-01-01')).toBe('du 26 décembre 2026 au 1 janvier 2027');
    expect(formatDDMM('2026-09-05')).toBe('05/09');
  });
  it('grille du mois (lundi en premier)', () => {
    const g = monthGrid(2026, 10); // novembre 2026 : commence un dimanche
    expect(g.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(g.length % 7).toBe(0);
  });
});

describe('ingrédients', () => {
  it('clé commune pour additionner', () => {
    expect(ingredientKey('Œufs')).toBe('oeuf');
    expect(ingredientKey('carottes (bio)')).toBe('carotte');
    expect(ingredientKey('Pois chiches')).toBe('pois chiche');
    expect(ingredientKey('noix')).toBe('noix');
    expect(isStaple('Sel, poivre')).toBe(true);
    expect(isStaple("Huile d'olive")).toBe(true);
    expect(isStaple('beurre')).toBe(false);
  });
});

describe('planning et courses', () => {
  const recipes = new Map([
    ['quiche', { id: 'quiche', title: 'Quiche', servings: 6, ingredients: [
      { name: 'œufs', qty: 3 }, { name: 'lardons', qty: 200, unit: 'g' }, { name: 'crème fraîche', qty: 20, unit: 'cl' }, { name: 'sel' },
    ] }],
    ['gratin', { id: 'gratin', title: 'Gratin', servings: 4, ingredients: [
      { name: 'Oeuf', qty: 1 }, { name: 'crème fraîche', qty: 0.5, unit: 'l' }, { name: 'pommes de terre', qty: 1, unit: 'kg' },
      { name: 'muscade', optional: true },
    ] }],
  ]);
  const plans = {
    '2026-09-05': { days: {
      '2026-09-05': { midi: [{ recipeId: 'quiche', title: 'Quiche', servings: 3 }], midiP: [{ text: 'Purée' }] },
      '2026-09-07': { soir: [{ recipeId: 'gratin', title: 'Gratin', servings: 4 }] },
    } },
    '2026-09-12': { days: { '2026-09-12': { soir: [{ recipeId: 'gratin', servings: 2 }] } } },
  };

  it('lit les créneaux et la période', () => {
    expect(slotEntries(plans, '2026-09-05', 'midiP')).toEqual([{ text: 'Purée' }]);
    expect(slotEntries(plans, '2026-09-06', 'midi')).toEqual([]);
    expect(entriesBetween(plans, '2026-09-05', '2026-09-11').map((e) => [e.date, e.slot])).toEqual([
      ['2026-09-05', 'midi'], ['2026-09-05', 'midiP'], ['2026-09-07', 'soir'],
    ]);
    expect([...plannedDays(plans)].sort()).toEqual(['2026-09-05', '2026-09-07', '2026-09-12']);
    expect(entryLabel({ recipeId: 'zzz', title: 'Ancienne' }, recipes)).toBe('Ancienne');
  });
});

describe('ordre des plats d’un repas', () => {
  it('déplace un plat d’une position à une autre, sans toucher à la liste d’origine', async () => {
    const { moveEntry } = await import('../src/logic/plan.js');
    const l = [{ text: 'Entrée' }, { text: 'Plat' }, { text: 'Dessert' }];
    expect(moveEntry(l, 2, 0).map((e) => e.text)).toEqual(['Dessert', 'Entrée', 'Plat']);
    expect(moveEntry(l, 0, 2).map((e) => e.text)).toEqual(['Plat', 'Dessert', 'Entrée']);
    expect(moveEntry(l, 1, 1).map((e) => e.text)).toEqual(['Entrée', 'Plat', 'Dessert']);
    expect(moveEntry(l, 0, 5).map((e) => e.text)).toEqual(['Entrée', 'Plat', 'Dessert']);
    expect(l.map((e) => e.text)).toEqual(['Entrée', 'Plat', 'Dessert']);
  });
  it('calcule la position d’arrivée en glissant', async () => {
    const { dropIndex } = await import('../src/ui/drag-sort.js');
    const mids = [50, 150, 250];
    expect(dropIndex(mids, 0, 50)).toBe(0);
    expect(dropIndex(mids, 0, 160)).toBe(1);
    expect(dropIndex(mids, 0, 300)).toBe(2);
    expect(dropIndex(mids, 2, 40)).toBe(0);
    expect(dropIndex(mids, 2, 120)).toBe(1);
  });
});
