import { describe, expect, it } from 'vitest';
import { parseDuration, parseRecipeText, readMeta, TM_SETTING } from '../src/logic/text-import.js';

const names = (r) => r.ingredients.map((i) => i.name);
const steps = (r) => r.steps.map((s) => s.section ? `# ${s.section}` : s.text);

describe('temps et portions', () => {
  it('lit les durées', () => {
    expect(parseDuration('1 h 30')).toBe(90);
    expect(parseDuration('1h30')).toBe(90);
    expect(parseDuration('45 min')).toBe(45);
    expect(parseDuration('2 heures')).toBe(120);
  });
  it('lit une ligne de temps et de portions', () => {
    expect(readMeta('Préparation : 15 min - Cuisson : 1 h')).toEqual({ meta: { prepMin: 15, cookMin: 60 }, only: true });
    expect(readMeta('Pour 6 personnes')).toEqual({ meta: { servings: 6 }, only: true });
    expect(readMeta('Temps de cuisson : 25 minutes')).toEqual({ meta: { cookMin: 25 }, only: true });
    expect(readMeta('12 pièces').meta).toEqual({}); // « 12 pièces » seul n'est pas un nombre de portions
    expect(readMeta('Pour 12 pièces').meta).toEqual({ servings: 12, servingsLabel: 'pièces' });
    expect(readMeta('Laisser en cuisson 20 min puis servir chaud avec la sauce').only).toBe(false);
  });
});

describe('coller une recette', () => {
  it('recette de notes avec titres de parties', () => {
    const r = parseRecipeText(`Gâteau au yaourt de Mamie

Pour 6 personnes
Préparation : 10 min
Cuisson : 35 min

Ingrédients :
- 1 pot de yaourt nature
- 2 pots de sucre
- 3 pots de farine
- 3 œufs
- ½ pot d'huile
- 1 sachet de levure

Préparation :
1. Préchauffer le four à 180 °C.
2. Mélanger le yaourt et le sucre, puis ajouter les œufs un par un.
3. Ajouter la farine, la levure et
l'huile.
4. Cuire 35 minutes.

Astuce : on peut ajouter des pépites de chocolat.`);
    expect(r.title).toBe('Gâteau au yaourt de Mamie');
    expect(r).toMatchObject({ servings: 6, prepMin: 10, cookMin: 35 });
    expect(names(r)).toEqual(['yaourt nature', 'sucre', 'farine', 'œufs', 'huile', 'levure']);
    expect(r.ingredients[0]).toMatchObject({ qty: 1, unit: 'pot' });
    expect(r.ingredients[4]).toMatchObject({ qty: 0.5, unit: 'pot' });
    expect(steps(r)).toEqual([
      'Préchauffer le four à 180 °C.',
      'Mélanger le yaourt et le sucre, puis ajouter les œufs un par un.',
      "Ajouter la farine, la levure et l'huile.",
      'Cuire 35 minutes.',
    ]);
    expect(r.notes).toBe('on peut ajouter des pépites de chocolat.');
  });

  it('recette sans titres de parties : devine ingrédients et étapes', () => {
    const r = parseRecipeText(`Pâtes carbonara
200 g de lardons
400 g de spaghetti
3 jaunes d'oeufs
50 g de parmesan
poivre
Faire cuire les pâtes dans l'eau bouillante salée.
Faire revenir les lardons à la poêle sans matière grasse.
Mélanger les jaunes et le parmesan, puis tout mélanger hors du feu.`);
    expect(r.title).toBe('Pâtes carbonara');
    expect(names(r)).toEqual(['lardons', 'spaghetti', "jaunes d'oeufs", 'parmesan', 'poivre']);
    expect(r.steps).toHaveLength(3);
  });

  it('sous-groupes d’ingrédients, sections d’étapes et ingrédients sur une ligne', () => {
    const r = parseRecipeText(`Tarte aux pommes
Ingrédients (pour 8 personnes) :
Pour la pâte :
250 g de farine
125 g de beurre
Pour la garniture :
4 pommes
Étapes
La pâte :
Mélanger la farine et le beurre du bout des doigts.
La cuisson :
Cuire 40 min à 180 °C.`);
    expect(r.servings).toBe(8);
    expect(r.ingredients.map((i) => [i.group, i.name])).toEqual([
      ['Pour la pâte', 'farine'], ['Pour la pâte', 'beurre'], ['Pour la garniture', 'pommes'],
    ]);
    expect(steps(r)).toEqual(['# La pâte', 'Mélanger la farine et le beurre du bout des doigts.', '# La cuisson', 'Cuire 40 min à 180 °C.']);

    const r2 = parseRecipeText('Vinaigrette\nIngrédients : 3 c. à s. d’huile, 1 c. à s. de vinaigre, 1 c. à c. de moutarde\nTout mélanger dans un bol.');
    expect(names(r2)).toEqual(['huile', 'vinaigre', 'moutarde']);
    expect(steps(r2)).toEqual(['Tout mélanger dans un bol.']);
  });

  it('repère le lien et la source', () => {
    const r = parseRecipeText('Risotto\nhttps://cookidoo.fr/recipes/recipe/fr-FR/r123\n300 g de riz\nCuire.');
    expect(r.source).toEqual({ type: 'cookidoo', title: 'Cookidoo', url: 'https://cookidoo.fr/recipes/recipe/fr-FR/r123' });
    const r2 = parseRecipeText('Quiche\nSource : Nadine\n3 œufs');
    expect(r2.source).toEqual({ type: 'perso', title: 'Nadine' });
    expect(parseRecipeText('Quiche\nSource : Le grand livre de la cuisine française').source.type).toBe('autre');
    expect(parseRecipeText('Crumble').source).toBeUndefined();
  });

  it('étapes avec puces et puces cochables', () => {
    const r = parseRecipeText(`Salade
Ingrédients
▢ 1 salade
☐ 2 tomates
Préparation
• Laver la salade.
• Couper les tomates en dés.`);
    expect(names(r)).toEqual(['salade', 'tomates']);
    expect(steps(r)).toEqual(['Laver la salade.', 'Couper les tomates en dés.']);
  });

  it('texte vide', () => {
    expect(parseRecipeText('')).toMatchObject({ title: 'Recette sans titre', ingredients: [], steps: [] });
  });
});

describe('Cookidoo', () => {
  const PAGE = `Quiche lorraine
4.6 (2345 avis)
Facile
Temps de préparation 20 min
Temps total 1h 10min
Portions 6 portions
Ingrédients
Pâte brisée
200 g
farine de blé
100 g
beurre, coupé en morceaux
1 pincée de sel
50 g d'eau
Garniture
200 g de lardons fumés
3
œufs
200 g crème fraîche épaisse
Accessoires nécessaires
Moule à tarte
Préparation
1
Préchauffer le four à 200 °C.
2
Mettre la farine, le beurre et le sel dans le bol et mixer 10 sec/vitesse 6.
3
Ajouter les œufs et la crème, mélanger 20 sec/vitesse 4.
4
Faire revenir les lardons 3 min/100°C/Ⓡ/vitesse Ⓢ.
Nutrition
par 1 portion
Calories
2134 kJ / 512 kcal
Protéines
14 g
https://cookidoo.fr/recipes/recipe/fr-FR/r130599`;

  it('reconnaît une page Cookidoo copiée', () => {
    const r = parseRecipeText(PAGE);
    expect(r.title).toBe('Quiche lorraine');
    expect(r).toMatchObject({ servings: 6, prepMin: 20 });
    expect(r.ingredients.map((i) => [i.group, i.qty, i.unit, i.name])).toEqual([
      ['Pâte brisée', 200, 'g', 'farine de blé'],
      ['Pâte brisée', 100, 'g', 'beurre'],
      ['Pâte brisée', 1, 'pincée', 'sel'],
      ['Pâte brisée', 50, 'g', 'eau'],
      ['Garniture', 200, 'g', 'lardons fumés'],
      ['Garniture', 3, undefined, 'œufs'],
      ['Garniture', 200, 'g', 'crème fraîche épaisse'],
    ]);
    expect(r.ingredients[1].note).toBe('coupé en morceaux');
    expect(r.steps.map((x) => x.text)).toEqual([
      'Préchauffer le four à 200 °C.',
      'Mettre la farine, le beurre et le sel dans le bol et mixer 10 sec/vitesse 6.',
      'Ajouter les œufs et la crème, mélanger 20 sec/vitesse 4.',
      'Faire revenir les lardons 3 min/100°C/Ⓡ/vitesse Ⓢ.',
    ]);
    expect(r.notes).toBe('Accessoires : Moule à tarte');
    expect(r.source).toEqual({ type: 'cookidoo', title: 'Cookidoo', url: 'https://cookidoo.fr/recipes/recipe/fr-FR/r130599' });
    expect(r.tags).toEqual(['thermomix']);
  });

  it('ne prend pas un ingrédient sans quantité pour un sous-titre', () => {
    const r = parseRecipeText('Pâtes\nIngrédients\n400 g de pâtes\ncrème fraîche\nparmesan\nGarniture\nbasilic');
    expect(r.ingredients.map((i) => [i.group, i.name])).toEqual([
      [undefined, 'pâtes'], [undefined, 'crème fraîche'], [undefined, 'parmesan'], ['Garniture', 'basilic'],
    ]);
  });

  it('repère les réglages Thermomix', () => {
    const find = (t) => t.match(new RegExp(TM_SETTING.source, 'gi'));
    expect(find('mixer 10 sec/vitesse 6 puis 3 min/100°C/vitesse 1')).toEqual(['10 sec/vitesse 6', '3 min/100°C/vitesse 1']);
    expect(find('cuire 20 min/Varoma/Ⓡ/vitesse Ⓢ')).toEqual(['20 min/Varoma/Ⓡ/vitesse Ⓢ']);
    expect(find('pétrir 2 min/mode pétrin')).toEqual(['mode pétrin']);
    expect(find('Mélanger à la main.')).toBe(null);
  });
});
