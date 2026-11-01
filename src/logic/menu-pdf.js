// Menu de la semaine en PDF, sur le modèle du « Planning des repas » papier
// de la famille : A4 paysage, une page par semaine (samedi → vendredi),
// lignes Midi / Poupette / Soir / Poupette, lignes Poupette grisées.
import { addDays, dayName, formatDDMM, formatRange, weekDays } from './dates.js';
import { SLOTS } from './plan.js';

const PAGE = { w: 297, h: 210 };
const X0 = 10;
const TABLE_W = 277;
const COL_W = TABLE_W / 7;
const Y0 = 30;
const HEAD_H = 17;
const ROW_H = { midi: 43, midiP: 29, soir: 43, soirP: 29 };
const GREY_HEAD = [233, 233, 233];
const GREY_ROW = [243, 243, 243];
const LINE = [150, 150, 150];
const DARK = [40, 40, 40];
const LABEL = [130, 130, 130];

/**
 * weeks : [{ start: '2026-09-05', cells: { '2026-09-05': { midi: ['Quiche'], … } }, inRange?: Set }]
 * jsPDF : le constructeur (chargé à la demande par l'app, ou en test).
 */
export function buildMenuPdf(jsPDF, weeks) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: 'Planning des repas', creator: 'On mange quoi ?' });
  weeks.forEach((week, i) => {
    if (i > 0) doc.addPage('a4', 'landscape');
    drawWeek(doc, week);
  });
  return doc;
}

function drawWeek(doc, { start, cells = {}, inRange = null }) {
  const days = weekDays(start);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...DARK);
  doc.text('Planning des repas', PAGE.w / 2, 17, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...LABEL);
  doc.text(`Semaine ${formatRange(start, addDays(start, 6))}`, PAGE.w / 2, 24, { align: 'center' });

  // En-tête des jours
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.setFillColor(...GREY_HEAD);
  doc.rect(X0, Y0, TABLE_W, HEAD_H, 'FD');
  days.forEach((d, c) => {
    const cx = X0 + c * COL_W + COL_W / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...DARK);
    doc.text(dayName(d), cx, Y0 + 7, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(formatDDMM(d), cx, Y0 + 13, { align: 'center' });
  });

  // Lignes
  let y = Y0 + HEAD_H;
  for (const slot of SLOTS) {
    const h = ROW_H[slot.id];
    if (slot.child) {
      doc.setFillColor(...GREY_ROW);
      doc.rect(X0, y, TABLE_W, h, 'F');
    }
    days.forEach((d, c) => {
      const x = X0 + c * COL_W;
      const out = inRange && !inRange.has(d);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...LABEL);
      doc.text(slot.label, x + 1.5, y + 4);
      const items = out ? [] : cells[d]?.[slot.id] || [];
      if (items.length) drawItems(doc, items, x + 2, y + 9, COL_W - 4, h - 11);
    });
    doc.setDrawColor(...LINE);
    doc.line(X0, y, X0 + TABLE_W, y);
    y += h;
  }
  // Colonnes et cadre
  for (let c = 1; c < 7; c++) doc.line(X0 + c * COL_W, Y0, X0 + c * COL_W, y);
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.5);
  doc.rect(X0, Y0, TABLE_W, y - Y0);
}

/** Textes d'une case, réduits si besoin pour tenir dans la hauteur. */
function drawItems(doc, items, x, y, w, maxH) {
  const texts = items.length > 1 ? items.map((t) => `• ${t}`) : items;
  for (let size = 10.5; size >= 6.5; size -= 0.5) {
    doc.setFontSize(size);
    const lines = texts.flatMap((t) => doc.splitTextToSize(t, w));
    const lineH = size * 0.42;
    if (lines.length * lineH <= maxH || size <= 6.5) {
      doc.setTextColor(...DARK);
      doc.setFont('helvetica', 'normal');
      const shown = lines.slice(0, Math.max(1, Math.floor(maxH / lineH)));
      shown.forEach((line, i) => doc.text(line, x, y + i * lineH));
      return;
    }
  }
}
