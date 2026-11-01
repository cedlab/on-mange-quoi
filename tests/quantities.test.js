import { describe, expect, it } from 'vitest';
import {
  factorForIngredient, factorForServings, formatNumber, formatQuantity, formatServings,
  ingredientsToText, ingredientToLine, parseIngredientLine, parseIngredientsText, parseStepsText, roundQty, stepsToText,
} from '../src/logic/quantities.js';

describe('parseIngredientLine', () => {
  const p = (s) => {
    const { raw, ...rest } = parseIngredientLine(s);
    return rest;
  };
  it('reconnaît quantité, unité et nom', () => {
    expect(p('200 g de farine')).toEqual({ qty: 200, unit: 'g', name: 'farine' });
    expect(p('50g sucre glace')).toEqual({ qty: 50, unit: 'g', name: 'sucre glace' });
    expect(p('1 kg de cabillaud (ou morue dessalée)')).toEqual({ qty: 1, unit: 'kg', name: 'cabillaud', note: 'ou morue dessalée' });
    expect(p('25 cl de lait')).toEqual({ qty: 25, unit: 'cl', name: 'lait' });
  });
  it('gère les cuillères sous toutes leurs formes', () => {
    expect(p('4 c à s de Yaourt')).toMatchObject({ qty: 4, unit: 'c. à s.', name: 'Yaourt' });
    expect(p("1 càs d'huile")).toMatchObject({ qty: 1, unit: 'c. à s.', name: 'huile' });
    expect(p('2 cuil. à soupe rase de noix de coco râpée')).toMatchObject({ qty: 2, unit: 'c. à s.', name: 'noix de coco râpée' });
    expect(p("1/2 c à c d'essence amère")).toMatchObject({ qty: 0.5, unit: 'c. à c.', name: 'essence amère' });
    expect(p('1 cuillère à café de cannelle')).toMatchObject({ qty: 1, unit: 'c. à c.', name: 'cannelle' });
  });
  it('gère les pièces, les fourchettes et les mots-nombres', () => {
    expect(p('6 oeufs durs')).toEqual({ qty: 6, name: 'oeufs durs' });
    expect(p("2 à 4 gousses d'ail")).toEqual({ qty: 2, qtyMax: 4, unit: 'gousse', name: 'ail' });
    expect(p('une pincée de sel')).toEqual({ qty: 1, unit: 'pincée', name: 'sel' });
    expect(p('1,5 l de bouillon')).toEqual({ qty: 1.5, unit: 'l', name: 'bouillon' });
    expect(p('½ citron')).toEqual({ qty: 0.5, name: 'citron' });
  });
  it('laisse tranquilles les ingrédients sans quantité', () => {
    expect(p('Sel, poivre')).toEqual({ name: 'Sel, poivre' });
    expect(p("l'huile d'olive")).toEqual({ name: "l'huile d'olive" });
    expect(p('Paprika (facultatif)')).toEqual({ name: 'Paprika', note: 'facultatif', optional: true });
    expect(p('un peu de beurre')).toEqual({ name: 'un peu de beurre' });
  });
  it('garde la ligne d’origine', () => {
    expect(parseIngredientLine(' - 3 carottes ').raw).toBe('- 3 carottes');
  });
});

describe('mise à l’échelle', () => {
  it('calcule le facteur selon les portions ou un ingrédient', () => {
    expect(factorForServings(4, 6)).toBe(1.5);
    expect(factorForServings(null, 6)).toBe(1);
    expect(factorForIngredient({ qty: 250, unit: 'g' }, 300)).toBeCloseTo(1.2);
    expect(factorForIngredient({ name: 'sel' }, 3)).toBe(1);
  });
  it('arrondit comme en cuisine', () => {
    expect(roundQty(333.33, 'g')).toBe(330);
    expect(roundQty(12.4, 'g')).toBe(12);
    expect(roundQty(2.4, undefined)).toBe(2.5);
    expect(roundQty(0.1, undefined)).toBe(0.5);
    expect(roundQty(1.3, 'c. à s.')).toBe(1.25);
    expect(roundQty(1.27, 'kg')).toBe(1.25);
  });
  it('affiche des nombres lisibles', () => {
    expect(formatNumber(1.5)).toBe('1 ½');
    expect(formatNumber(0.25, 'c. à c.')).toBe('¼');
    expect(formatNumber(1.5, 'l')).toBe('1,5');
    expect(formatNumber(3)).toBe('3');
  });
  it('met à l’échelle les quantités affichées', () => {
    expect(formatQuantity({ qty: 200, unit: 'g', name: 'farine' }, 1.5)).toBe('300 g');
    expect(formatQuantity({ qty: 2, qtyMax: 3, unit: 'gousse', name: 'ail' }, 2)).toBe('4 à 6 gousses');
    expect(formatQuantity({ qty: 3, name: 'oeufs' }, 0.5)).toBe('1 ½');
    expect(formatQuantity({ name: 'sel' }, 2)).toBe('');
  });
  it('affiche les portions décimales avec un arrondi', () => {
    expect(formatServings(4, 1)).toBe('4');
    expect(formatServings(4, 1.2)).toBe('4,8 (≈ 5)');
    expect(formatServings(4, 1.5)).toBe('6');
  });
});

describe('texte du formulaire', () => {
  it('lit les groupes et les ingrédients', () => {
    const list = parseIngredientsText('200 g de farine\n\nPour la glace :\n50 cl de lait de coco\n# Décor\nmenthe');
    expect(list.map((i) => [i.group, i.name])).toEqual([
      [undefined, 'farine'], ['Pour la glace', 'lait de coco'], ['Décor', 'menthe'],
    ]);
    expect(ingredientsToText(list)).toBe('200 g de farine\n\nPour la glace :\n50 cl de lait de coco\n\nDécor :\nmenthe');
  });
  it('reconstruit une ligne sans texte d’origine', () => {
    expect(ingredientToLine({ qty: 2, unit: 'gousse', name: 'ail' })).toBe("2 gousses d'ail");
    expect(ingredientToLine({ qty: 200, unit: 'g', name: 'farine', note: 'tamisée' }, 2)).toBe('400 g de farine (tamisée)');
  });
  it('lit les étapes et les sections', () => {
    const steps = parseStepsText('# Étape 1 : la pâte\n1. Mélanger\n\n2) Cuire 20 min');
    expect(steps).toEqual([{ section: 'Étape 1 : la pâte' }, { text: 'Mélanger' }, { text: 'Cuire 20 min' }]);
    expect(stepsToText(steps)).toBe('# Étape 1 : la pâte\nMélanger\nCuire 20 min');
  });
});
