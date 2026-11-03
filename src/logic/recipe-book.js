// Livre de recettes en PDF (sauvegarde lisible et imprimable) :
// couverture, sommaire cliquable, chapitres par catégorie, une recette par page.
// Logique pure : le constructeur jsPDF et les photos sont fournis par l'app.
import { ingredientToLine } from './quantities.js';
import { CATEGORIES, formatMinutes, formatRating, totalMinutes } from './recipes.js';
import { sourceLabel, sourceType } from './sources.js';

const PAGE = { w: 210, h: 297 };
const M = 18; // marges
const W = PAGE.w - 2 * M;
const GREEN = [36, 101, 42];
const DARK = [35, 40, 35];
const MUTED = [120, 125, 118];
const LIGHT = [242, 239, 230];
const TOC_LINE = 7;
const TOC_FIRST = 34; // y de la première ligne du sommaire
const TOC_PER_PAGE = Math.floor((PAGE.h - M - 12 - TOC_FIRST) / TOC_LINE);

/**
 * Texte compatible avec les polices standard du PDF (accents français, œ, ½…) :
 * réglages Thermomix écrits en clair, autres symboles retirés.
 */
export function pdfText(s) {
  return String(s ?? '')
    .replace(/Ⓡ/g, 'sens inverse')
    .replace(/vitesse\s*Ⓢ/gi, 'vitesse mijotage')
    .replace(/Ⓢ/g, 'mijotage')
    .replace(/⅓/g, '1/3').replace(/⅔/g, '2/3').replace(/⅛/g, '1/8')
    .replace(/[   ]/g, ' ')
    .replace(/[‐‑‒]/g, '-')
    .replace(/[^\u0000-ÿ€œŒ‘’“”–—…•]/gu, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Chapitres : catégories dans l'ordre de l'app, puis « Autres recettes » ; recettes de A à Z. */
export function bookChapters(recipes) {
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'fr');
  const chapters = CATEGORIES.map((c) => ({ title: c.label, recipes: recipes.filter((r) => r.category === c.id).sort(byTitle) }));
  chapters.push({ title: 'Autres recettes', recipes: recipes.filter((r) => !CATEGORIES.some((c) => c.id === r.category)).sort(byTitle) });
  return chapters.filter((c) => c.recipes.length);
}

/**
 * recipes : recettes actives ; photos : Map id → { data (dataURL JPEG), w, h }.
 * Retourne le document jsPDF.
 */
export function buildRecipeBook(jsPDF, recipes, { photos = new Map(), title = 'Nos recettes', date = new Date() } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title, creator: 'On mange quoi ?' });
  const chapters = bookChapters(recipes);
  const tocLines = chapters.reduce((n, c) => n + 1 + c.recipes.length, 0);
  const tocPages = Math.max(1, Math.ceil(tocLines / TOC_PER_PAGE));

  cover(doc, title, recipes.length, date);
  for (let i = 0; i < tocPages; i++) doc.addPage();

  // Recettes (on note la page de chacune pour le sommaire)
  const pages = new Map();
  for (const ch of chapters) {
    ch.recipes.forEach((r, i) => {
      doc.addPage();
      pages.set(r.id, doc.getNumberOfPages());
      recipePages(doc, r, { photo: photos.get(r.id), chapter: i === 0 ? ch.title : null });
    });
  }

  toc(doc, chapters, pages, tocPages);
  footers(doc, title);
  return doc;
}

function cover(doc, title, count, date) {
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, PAGE.w, PAGE.h, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(40);
  doc.text(pdfText(title), PAGE.w / 2, 120, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(15);
  doc.text(`${count} recette${count > 1 ? 's' : ''}`, PAGE.w / 2, 136, { align: 'center' });
  doc.setFontSize(11);
  const d = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`On mange quoi ? · ${d}`, PAGE.w / 2, PAGE.h - 24, { align: 'center' });
}

function toc(doc, chapters, pages, tocPages) {
  let page = 2;
  let y = TOC_FIRST;
  doc.setPage(page);
  heading(doc, 'Sommaire');
  const next = () => {
    y += TOC_LINE;
    if (y > PAGE.h - M - 12 && page < 1 + tocPages) {
      page += 1;
      doc.setPage(page);
      y = TOC_FIRST;
    }
  };
  for (const ch of chapters) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...GREEN);
    doc.text(pdfText(ch.title), M, y);
    next();
    for (const r of ch.recipes) {
      const p = pages.get(r.id);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(...DARK);
      const name = doc.splitTextToSize(pdfText(r.title), W - 22)[0];
      doc.text(name, M + 4, y);
      doc.setTextColor(...MUTED);
      doc.text(String(p), PAGE.w - M, y, { align: 'right' });
      doc.setDrawColor(215, 212, 200);
      doc.setLineDashPattern([0.4, 1], 0);
      doc.line(M + 6 + doc.getTextWidth(name), y - 0.8, PAGE.w - M - 3 - doc.getTextWidth(String(p)), y - 0.8);
      doc.setLineDashPattern([], 0);
      doc.link(M, y - 4.5, W, TOC_LINE, { pageNumber: p });
      next();
    }
    y += 2;
  }
}

function heading(doc, text) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.text(text, M, 24);
}

function footers(doc, title) {
  const n = doc.getNumberOfPages();
  for (let p = 2; p <= n; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(title), M, PAGE.h - 10);
    doc.text(String(p), PAGE.w - M, PAGE.h - 10, { align: 'right' });
  }
}

/** Une recette (sur plusieurs pages si besoin). */
function recipePages(doc, r, { photo, chapter }) {
  let y = M;
  const bottom = PAGE.h - M - 6;
  const ensure = (h) => {
    if (y + h > bottom) {
      doc.addPage();
      y = M;
    }
  };

  if (chapter) {
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, PAGE.w, 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(pdfText(chapter).toUpperCase(), M, 8);
    y = 22;
  }

  // Titre
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(...DARK);
  const titleLines = doc.splitTextToSize(pdfText(r.title), W);
  doc.text(titleLines, M, y + 6);
  y += 6 + titleLines.length * 8;

  // Infos : portions, temps, note, source
  const t = totalMinutes(r);
  const meta = [
    r.servings && `${r.servings} ${r.servingsLabel || 'personnes'}`,
    r.prepMin && `Préparation ${formatMinutes(r.prepMin)}`,
    r.cookMin && `Cuisson ${formatMinutes(r.cookMin)}`,
    r.restMin && `Repos ${formatMinutes(r.restMin)}`,
    t && (r.cookMin || r.restMin) && `Total ${formatMinutes(t)}`,
    r.rating && `Note ${formatRating(r.rating)}/5`,
  ].filter(Boolean).join('  ·  ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  if (meta) {
    doc.text(pdfText(meta), M, y);
    y += 5;
  }
  doc.text(pdfText(`Source : ${sourceType(r.source?.type).label} — ${sourceLabel(r.source)}`), M, y);
  y += 8;

  // Photo (cadrée sur la largeur, hauteur limitée)
  if (photo?.data && photo.w && photo.h) {
    const maxH = 62;
    let w = W;
    let h = (W * photo.h) / photo.w;
    if (h > maxH) {
      h = maxH;
      w = (maxH * photo.w) / photo.h;
    }
    try {
      doc.addImage(photo.data, 'JPEG', M + (W - w) / 2, y, w, h, undefined, 'FAST');
      y += h + 7;
    } catch {
      /* photo illisible : on continue sans */
    }
  }

  // Ingrédients, sur deux colonnes
  const ings = r.ingredients || [];
  if (ings.length) {
    ensure(16);
    sectionTitle(doc, 'Ingrédients', y);
    y += 7;
    const items = [];
    let group = null;
    for (const ing of ings) {
      if ((ing.group || null) !== group) {
        group = ing.group || null;
        if (group) items.push({ group: pdfText(group) });
      }
      items.push({ text: pdfText(ingredientToLine(ing)) });
    }
    doc.setFontSize(10);
    const colW = (W - 8) / 2;
    const lines = items.map((it) => (it.group
      ? { bold: true, lines: doc.splitTextToSize(it.group, colW) }
      : { lines: doc.splitTextToSize(`• ${it.text}`, colW) }));
    const lineH = 4.6;
    const total = lines.reduce((n, l) => n + l.lines.length, 0);
    const half = Math.ceil(total / 2);
    let col = 0;
    let count = 0;
    const startY = y;
    let cy = y;
    let maxY = y;
    for (const l of lines) {
      if (col === 0 && count >= half && !l.bold) {
        col = 1;
        cy = startY;
      }
      if (cy + l.lines.length * lineH > bottom) {
        doc.addPage();
        cy = M;
      }
      doc.setFont('helvetica', l.bold ? 'bold' : 'normal');
      doc.setTextColor(...(l.bold ? GREEN : DARK));
      doc.text(l.lines, M + col * (colW + 8), cy);
      cy += l.lines.length * lineH;
      count += l.lines.length;
      maxY = Math.max(maxY, cy);
    }
    y = maxY + 5;
  }

  // Étapes numérotées
  const steps = r.steps || [];
  if (steps.length) {
    ensure(16);
    sectionTitle(doc, 'Préparation', y);
    y += 7;
    let n = 0;
    for (const s of steps) {
      if (s.section) {
        ensure(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(...GREEN);
        doc.text(pdfText(s.section), M, y + 1);
        y += 6;
        continue;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(pdfText(s.text), W - 9);
      ensure(lines.length * 4.6 + 2);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GREEN);
      doc.text(`${++n}.`, M, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK);
      doc.text(lines, M + 8, y);
      y += lines.length * 4.6 + 2.2;
    }
    y += 3;
  }

  // Notes
  if (r.notes) {
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(pdfText(r.notes.replace(/\n+/g, '\n')), W - 8);
    const h = lines.length * 4.3 + 10;
    ensure(Math.min(h, 60));
    doc.setFillColor(...LIGHT);
    doc.roundedRect(M, y, W, Math.min(h, bottom - y), 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text('Notes', M + 4, y + 6);
    doc.setFont('helvetica', 'normal');
    let ly = y + 11;
    for (const line of lines) {
      if (ly > bottom) {
        doc.addPage();
        ly = M;
      }
      doc.text(line, M + 4, ly);
      ly += 4.3;
    }
    y = ly + 3;
  }

  if (r.source?.url) {
    ensure(6);
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.textWithLink(pdfText(r.source.url).slice(0, 110), M, y + 2, { url: r.source.url });
  }
}

function sectionTitle(doc, text, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...GREEN);
  doc.text(text, M, y);
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.3);
  doc.line(M, y + 1.8, M + 14, y + 1.8);
}
