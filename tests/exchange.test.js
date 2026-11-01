import { describe, expect, it } from 'vitest';
import { buildExport, duplicateKey, FORMAT, parseImport } from '../src/logic/exchange.js';

const file = (recipes, extra = {}) => JSON.stringify({ format: FORMAT, version: 1, recipes, ...extra });
const rec = (title, extra = {}) => ({ title, source: { type: 'pdf', title: 'Livre 2', page: 3 }, ingredients: [{ name: 'farine', qty: 100, unit: 'g' }], steps: [{ text: 'Mélanger' }], ...extra });

describe('import', () => {
  it('refuse les fichiers étrangers', () => {
    expect(() => parseImport('pas du json')).toThrow(/JSON/);
    expect(() => parseImport('{"a":1}')).toThrow(/fichier de recettes/);
    expect(() => parseImport(file([], { version: 99 }))).toThrow(/plus récente/);
  });
  it('lit les recettes, les photos et repère les doublons', () => {
    const { items, errors } = parseImport(file([
      rec('Aïoli', { photo: 'data:image/jpeg;base64,AAAA' }),
      rec('Aïoli'),
      rec('Sans source', { source: null }),
      rec('Gratin', { photo: 'javascript:alert(1)' }),
    ]), [{ title: 'Gratin', source: { type: 'pdf', title: 'Livre 2' } }]);
    expect(errors).toEqual(['« Sans source » : Indique la source de la recette.']);
    expect(items.map((i) => [i.recipe.title, Boolean(i.photo), i.duplicate])).toEqual([
      ['Aïoli', true, false], ['Aïoli', false, true], ['Gratin', false, true],
    ]);
    expect(items[0].recipe.source).toEqual({ type: 'pdf', title: 'Livre 2', page: 3 });
  });
  it('exporte dans le même format', () => {
    const out = buildExport([{ id: 'x', ...rec('A'), thumb: 't', createdBy: 'moi' }, { id: 'y', ...rec('B'), deleted: true }], new Map([['x', 'data:image/jpeg;base64,BB']]));
    expect(out.recipes).toHaveLength(1);
    expect(out.recipes[0].photo).toBe('data:image/jpeg;base64,BB');
    expect(out.recipes[0].thumb).toBeUndefined();
    expect(parseImport(JSON.stringify(out)).items).toHaveLength(1);
    expect(duplicateKey({ title: 'Crème Brûlée', source: { title: 'Moi' } })).toBe('creme brulee|moi');
  });
});
