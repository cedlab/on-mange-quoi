import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { bookChapters, buildRecipeBook, pdfText } from '../src/logic/recipe-book.js';

const R = (id, title, category, extra = {}) => ({
  id, title, category, servings: 4, prepMin: 20, source: { type: 'cookidoo', title: 'Cookidoo', url: 'https://cookidoo.fr/r/1' },
  ingredients: [{ qty: 200, unit: 'g', name: 'farine' }, { qty: 3, name: 'œufs', group: 'Pour la pâte' }],
  steps: [{ section: 'La pâte' }, { text: 'Mixer 10 sec/vitesse 5.' }, { text: 'Cuire 20 min/100°C/Ⓡ/vitesse Ⓢ.' }],
  notes: 'Astuce : servir chaud.', ...extra,
});

describe('livre de recettes PDF', () => {
  it('écrit les réglages Thermomix en clair et garde les accents', () => {
    expect(pdfText('Cuire 5 min/100°C/Ⓡ/vitesse Ⓢ. ½ c. à café 🍲')).toBe('Cuire 5 min/100°C/sens inverse/vitesse mijotage. ½ c. à café');
  });
  it('classe par catégorie puis de A à Z', () => {
    const ch = bookChapters([R('1', 'Tarte', 'dessert'), R('2', 'Blanquette', 'plat'), R('3', 'Aïoli', 'plat'), R('4', 'Divers', undefined)]);
    expect(ch.map((c) => [c.title, c.recipes.map((r) => r.title)])).toEqual([
      ['Plat', ['Aïoli', 'Blanquette']], ['Dessert', ['Tarte']], ['Autres recettes', ['Divers']],
    ]);
  });
  it('couverture, sommaire, une page par recette (plus si longue)', () => {
    const long = R('5', 'Très longue', 'plat', { steps: Array.from({ length: 80 }, (_, i) => ({ text: `Étape ${i} : mélanger longuement la préparation jusqu’à ce qu’elle soit bien lisse et homogène.` })) });
    const doc = buildRecipeBook(jsPDF, [R('1', 'Quiche lorraine', 'plat'), R('2', 'Crème brûlée', 'dessert'), long]);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1 + 1 + 3 + 1);
    const text = doc.output();
    expect(text).toContain('Sommaire');
    expect(text).toContain('Quiche lorraine');
    expect(text).toContain('sens inverse');
  });
});
