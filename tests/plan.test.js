import { describe, expect, it } from 'vitest';
import { guessAisle, ingredientKey, isStaple } from '../src/logic/aisles.js';
import {
  addDays, daysBetween, formatDDMM, formatRange, monthGrid, weekDays, weekStart, weeksBetween,
} from '../src/logic/dates.js';
import {
  buildShoppingList, entriesBetween, entryLabel, formatAmounts, mergeShopping, plannedDays, shoppingText, slotEntries,
} from '../src/logic/plan.js';

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

describe('rayons', () => {
  it('range les ingrédients', () => {
    const cases = {
      carottes: 'fruits-legumes', 'persil haché': 'fruits-legumes', 'blanc de poireau': 'fruits-legumes',
      'lardons fumés': 'charcuterie', 'escalopes de poulet': 'boucherie', 'crème fraîche épaisse': 'cremerie',
      œufs: 'cremerie', 'lait de coco': 'conserves', 'crème de marrons': 'epicerie-sucree', 'sucre glace': 'epicerie-sucree',
      'farine de blé': 'epicerie-salee', spaghetti: 'epicerie-salee', parmesan: 'fromages', 'pâte brisée': 'epicerie-salee',
      'petits pois surgelés': 'surgeles', 'vin blanc': 'boissons', 'huile d\'olive': 'epices', cabillaud: 'poissonnerie',
      'jus de citron': 'fruits-legumes', 'truc inconnu': 'autre',
    };
    for (const [name, a] of Object.entries(cases)) expect([name, guessAisle(name)]).toEqual([name, a]);
    expect(guessAisle('carottes', { carotte: 'surgeles' })).toBe('surgeles');
  });
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

  it('additionne les ingrédients aux portions prévues', () => {
    const list = buildShoppingList(entriesBetween(plans, '2026-09-05', '2026-09-12'), recipes);
    const by = Object.fromEntries(list.map((i) => [i.key, i]));
    // Quiche pour 3 (moitié), gratin pour 4 puis pour 2 (× 1,5).
    expect(by.oeuf.amounts).toEqual([{ qty: 3, unit: null }]); // 1,5 + 1,5
    expect(by.lardon.amounts).toEqual([{ qty: 100, unit: 'g' }]);
    expect(by['creme fraiche'].amounts).toEqual([{ qty: 850, unit: 'ml' }]); // 100 ml + 750 ml
    expect(by['pomme de terre'].amounts).toEqual([{ qty: 1500, unit: 'g' }]);
    expect(by.sel.staple).toBe(true);
    expect(by.muscade).toBeUndefined(); // facultatif
    expect(by.oeuf.recipes).toEqual(['Quiche', 'Gratin']);
    expect(list[0].aisle).toBe('fruits-legumes');
    expect(formatAmounts(by['pomme de terre'].amounts)).toBe('1,5 kg');
    expect(formatAmounts(by['creme fraiche'].amounts)).toBe('85 cl');
    expect(formatAmounts([{ qty: 2, unit: 'sachet' }, { qty: 100, unit: 'g' }])).toBe('2 sachets + 100 g');
  });

  it('garde les cases cochées et les ajouts à la main en régénérant', () => {
    const existing = [
      { id: 'a', key: 'oeuf', checked: true, manual: false },
      { id: 'b', key: 'vieux', checked: false, manual: false },
      { id: 'c', key: 'lessive', checked: false, manual: true },
    ];
    const { upserts, removals } = mergeShopping(existing, [{ key: 'oeuf', name: 'œufs', amounts: [] }, { key: 'lardon', name: 'lardons', amounts: [] }]);
    expect(upserts.map((u) => [u.key, u.id, u.checked])).toEqual([['oeuf', 'a', true], ['lardon', null, false]]);
    expect(removals).toEqual(['b']);
  });

  it('texte à partager', () => {
    const t = shoppingText([
      { name: 'carottes', amounts: [{ qty: 500, unit: 'g' }], aisle: 'fruits-legumes' },
      { name: 'œufs', amounts: [{ qty: 6, unit: null }], aisle: 'cremerie', checked: true },
      { name: 'lait', amounts: [], aisle: 'cremerie' },
    ], (a) => a.toUpperCase());
    expect(t).toBe('🛒 Liste de courses\n\nFRUITS-LEGUMES\n☐ carottes — 500 g\n\nCREMERIE\n☐ lait');
  });
});
