import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { buildMenuPdf } from '../src/logic/menu-pdf.js';

describe('menu PDF', () => {
  it('une page par semaine, avec les plats et les accents', () => {
    const doc = buildMenuPdf(jsPDF, [
      { start: '2026-09-05', cells: { '2026-09-05': { midi: ['Quiche lorraine'], midiP: ['Purée carottes'], soir: ['Bœuf bourguignon', 'Crème brûlée'] } } },
      { start: '2026-09-12', cells: {} },
    ]);
    expect(doc.getNumberOfPages()).toBe(2);
    const text = doc.output();
    expect(text).toContain('Planning des repas');
    expect(text).toContain('Quiche lorraine');
    expect(text.length).toBeGreaterThan(3000);
  });
});
