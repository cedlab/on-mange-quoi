// Quantités, unités et mise à l'échelle des recettes (logique pure, testée).
//
// Un ingrédient : { qty?, qtyMax?, unit?, name, note?, group?, optional?, raw? }
//   qty/qtyMax : nombres (qtyMax pour « 2 à 3 »)
//   unit       : unité normalisée (voir UNITS) ou absente (pièces : « 3 œufs »)
//   raw        : la ligne telle qu'elle a été saisie ou importée

/** Unités reconnues : forme normalisée → { motif de reconnaissance, famille, pas d'arrondi }. */
export const UNITS = [
  { unit: 'kg', re: 'kilos?|kilogrammes?|kg', kind: 'mass' },
  { unit: 'g', re: 'grammes?|gr\\.?|g', kind: 'mass' },
  { unit: 'mg', re: 'mg', kind: 'mass' },
  { unit: 'l', re: 'litres?|l', kind: 'volume' },
  { unit: 'dl', re: 'dl', kind: 'volume' },
  { unit: 'cl', re: 'cl', kind: 'volume' },
  { unit: 'ml', re: 'ml', kind: 'volume' },
  {
    unit: 'c. à s.',
    re: "(?:cuill?(?:e|è)re?s?|cuill?\\.?|c\\.?)\\s*(?:à|a)\\s*(?:soupe|s\\.?)(?:\\s+rases?|\\s+bombées?)?|c\\.?\\s?à\\.?\\s?s\\.?|càs|cas|cs",
    kind: 'spoon',
  },
  {
    unit: 'c. à c.',
    re: "(?:cuill?(?:e|è)re?s?|cuill?\\.?|c\\.?)\\s*(?:à|a)\\s*(?:café|cafe|c\\.?|thé)(?:\\s+rases?|\\s+bombées?)?|c\\.?\\s?à\\.?\\s?c\\.?|càc|cac|cc",
    kind: 'spoon',
  },
  { unit: 'pincée', re: 'pincées?' },
  { unit: 'sachet', re: 'sachets?' },
  { unit: 'boîte', re: 'bo(?:î|i)tes?' },
  { unit: 'gousse', re: 'gousses?' },
  { unit: 'tranche', re: 'tranches?' },
  { unit: 'brin', re: 'brins?' },
  { unit: 'feuille', re: 'feuilles?' },
  { unit: 'botte', re: 'bottes?' },
  { unit: 'bouquet', re: 'bouquets?' },
  { unit: 'verre', re: 'verres?' },
  { unit: 'tasse', re: 'tasses?' },
  { unit: 'bol', re: 'bols?' },
  { unit: 'pot', re: 'pots?' },
  { unit: 'filet', re: 'filets?' },
  { unit: 'morceau', re: 'morceaux?' },
  { unit: 'branche', re: 'branches?' },
  { unit: 'poignée', re: 'poignées?' },
  { unit: 'cube', re: 'cubes?' },
  { unit: 'rouleau', re: 'rouleaux?' },
  { unit: 'paquet', re: 'paquets?' },
  { unit: 'tablette', re: 'tablettes?' },
  { unit: 'carré', re: 'carrés?' },
  { unit: 'barquette', re: 'barquettes?' },
  { unit: 'bâton', re: 'bâtons?|batons?' },
  { unit: 'louche', re: 'louches?' },
  { unit: 'dose', re: 'doses?' },
  { unit: 'trait', re: 'traits?' },
  { unit: 'goutte', re: 'gouttes?' },
  { unit: 'noix', re: 'noix(?=\\s+de)' },
  { unit: 'zeste', re: "zestes?(?=\\s+d)" },
  { unit: 'boule', re: 'boules?(?=\\s+de)' },
  { unit: 'bouteille', re: 'bouteilles?' },
  { unit: 'brique', re: 'briques?' },
  { unit: 'pavé', re: 'pavés?' },
  { unit: 'tête', re: 'têtes?' },
  { unit: 'cuillère', re: 'cuill?(?:e|è)res?|cuil\\.?' },
];

const UNIT_INFO = Object.fromEntries(UNITS.map((u) => [u.unit, u]));

/** Facteurs de conversion vers l'unité de base de chaque famille (g, ml). */
const TO_BASE = { kg: 1000, g: 1, mg: 0.001, l: 1000, dl: 100, cl: 10, ml: 1 };

export function unitKind(unit) {
  return UNIT_INFO[unit]?.kind || (unit ? 'count-unit' : 'count');
}

/** Pluriel d'affichage d'une unité (« 2 gousses », « 3 c. à s. »). */
export function unitLabel(unit, qty) {
  if (!unit) return '';
  if (TO_BASE[unit] || unit.includes('.')) return unit;
  if (qty === undefined || qty === null || qty <= 1) return unit;
  if (unit === 'morceau' || unit === 'rouleau') return `${unit}x`;
  if (unit === 'noix') return unit;
  return `${unit}s`;
}

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const NUM_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12, demi: 0.5 };
const NUM = '(\\d+(?:[.,]\\d+)?(?:\\s*/\\s*\\d+)?|[½¼¾⅓⅔]|\\d+\\s*[½¼¾])';

export function parseNumber(s) {
  if (s === undefined || s === null) return null;
  const t = String(s).trim().replace(',', '.');
  if (!t) return null;
  if (FRACTIONS[t] !== undefined) return FRACTIONS[t];
  const mixed = t.match(/^(\d+)\s*([½¼¾])$/);
  if (mixed) return Number(mixed[1]) + FRACTIONS[mixed[2]];
  const frac = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Analyse une ligne d'ingrédient en français : « 200 g de farine »,
 * « 2 à 3 gousses d'ail (hachées) », « 1 c. à s. d'huile », « sel, poivre ».
 */
const HTML_FRACTIONS = { frac12: '½', frac14: '¼', frac34: '¾', nbsp: ' ', amp: '&' };

export function parseIngredientLine(line) {
  // « &frac12; c. à café de sel » : entité HTML restée dans le texte d'un site.
  const raw = String(line || '').replace(/&(frac12|frac14|frac34|nbsp|amp);/g, (_, n) => HTML_FRACTIONS[n]).trim();
  let s = raw.replace(/^[-•*·]\s*/, '').trim();
  const res = { name: s };
  let qty = null;
  let qtyMax = null;
  let rest = s;
  const m = s.match(new RegExp(`^${NUM}(?:\\s*(?:à|a|-|ou)\\s*${NUM})?\\s*`));
  if (m && m[0].trim()) {
    qty = parseNumber(m[1]);
    if (m[2]) qtyMax = parseNumber(m[2]);
    rest = s.slice(m[0].length);
  } else {
    const w = s.match(/^(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze|demi)\b\s*/i);
    if (w && !/^(un|une)\s+peu\b/i.test(s)) {
      qty = NUM_WORDS[w[1].toLowerCase()];
      rest = s.slice(w[0].length);
    }
  }
  let unit = null;
  for (const u of UNITS) {
    const um = rest.match(new RegExp(`^(?:${u.re})(?=[\\s.'’(]|$)\\.?\\s*`, 'i'));
    if (!um) continue;
    // Sans nombre, « l », « g »… seraient le début d'un mot (« l'huile »).
    if (qty === null && (TO_BASE[u.unit] || u.unit === 'cuillère')) break;
    unit = u.unit;
    rest = rest.slice(um[0].length);
    break;
  }
  rest = rest.trim().replace(/^(de la |de l['’]|des |du |de |d['’])/i, '').trim();
  let note = null;
  const p = rest.match(/\s*\(([^)]*)\)\s*/);
  if (p) {
    note = p[1].trim();
    rest = `${rest.slice(0, p.index)} ${rest.slice(p.index + p[0].length)}`.trim();
  }
  rest = rest.replace(/\s+/g, ' ').replace(/^[\s,;]+|[\s,;]+$/g, '');
  if (qty !== null && !note && rest.includes(',')) {
    const i = rest.indexOf(',');
    note = rest.slice(i + 1).trim();
    rest = rest.slice(0, i).trim();
  }
  res.name = rest || s;
  if (qty !== null) res.qty = qty;
  if (qtyMax !== null) res.qtyMax = qtyMax;
  if (unit) res.unit = unit;
  if (note) res.note = note;
  if (/facultatif/i.test(raw)) res.optional = true;
  res.raw = raw;
  return res;
}

/** Ligne de texte d'un ingrédient (pour l'édition et le partage). */
export function ingredientToLine(ing, factor = 1) {
  if (ing.raw && factor === 1) return ing.raw;
  const parts = [];
  if (ing.qty !== undefined && ing.qty !== null) {
    const q = scaledQty(ing, factor);
    parts.push(formatRange(q.qty, q.qtyMax, ing.unit));
    if (ing.unit) parts.push(unitLabel(ing.unit, q.qty));
    parts.push(ing.unit ? `${deOrD(ing.name)}${ing.name}` : ing.name);
  } else {
    parts.push(ing.name);
  }
  let line = parts.join(' ').replace(/' /g, "'");
  if (ing.note) line += ` (${ing.note})`;
  return line;
}

function deOrD(name) {
  return /^[aeiouyhâàéèêëîïôöûùüœ]/i.test(name || '') ? "d'" : 'de ';
}

// --- Mise à l'échelle ---------------------------------------------------------

/** Les ingrédients sans quantité (« sel », « huile ») ne changent pas. */
export function scaledQty(ing, factor) {
  if (ing.qty === undefined || ing.qty === null) return { qty: null, qtyMax: null };
  return {
    qty: ing.qty * factor,
    qtyMax: ing.qtyMax !== undefined && ing.qtyMax !== null ? ing.qtyMax * factor : null,
  };
}

/** Facteur quand on change le nombre de portions. */
export function factorForServings(baseServings, servings) {
  if (!baseServings || !servings) return 1;
  return servings / baseServings;
}

/** Facteur quand on fixe la quantité d'un ingrédient (« j'ai 300 g de farine »). */
export function factorForIngredient(ing, newQty) {
  if (!ing?.qty || !newQty || newQty <= 0) return 1;
  return newQty / ing.qty;
}

/** Arrondi « de cuisine » adapté à l'unité. */
export function roundQty(value, unit) {
  if (value === null || value === undefined || !Number.isFinite(value)) return value;
  const kind = unitKind(unit);
  if (kind === 'mass' || kind === 'volume') {
    const base = value * (TO_BASE[unit] || 1);
    // Valeurs en g/ml : pas croissant avec la grandeur.
    let step;
    if (base < 5) step = 0.5;
    else if (base < 20) step = 1;
    else if (base < 100) step = 5;
    else if (base < 1000) step = 10;
    else step = 50;
    return Math.round((base / step)) * step / (TO_BASE[unit] || 1);
  }
  if (kind === 'spoon') return Math.max(0.25, Math.round(value * 4) / 4);
  // Pièces, gousses, sachets… : au demi près, jamais 0.
  return Math.max(0.5, Math.round(value * 2) / 2);
}

const FRACTION_GLYPHS = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];

/** Nombre lisible en français : 1,5 → « 1 ½ », 0,25 → « ¼ », 2,4 → « 2,4 ». */
export function formatNumber(n, unit) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const kind = unitKind(unit);
  const r = roundQty(n, unit);
  if (kind !== 'mass' && kind !== 'volume') {
    const whole = Math.floor(r + 1e-9);
    const frac = r - whole;
    if (frac < 1e-6) return String(whole);
    const g = FRACTION_GLYPHS.find(([v]) => Math.abs(v - frac) < 0.01);
    if (g) return whole ? `${whole} ${g[1]}` : g[1];
  }
  const rounded = Math.round(r * 100) / 100;
  return String(rounded).replace('.', ',');
}

export function formatRange(qty, qtyMax, unit) {
  if (qty === null || qty === undefined) return '';
  const a = formatNumber(qty, unit);
  if (qtyMax === null || qtyMax === undefined) return a;
  return `${a} à ${formatNumber(qtyMax, unit)}`;
}

/** « 200 g », « 2 gousses », « 3 » — quantité affichée devant le nom. */
export function formatQuantity(ing, factor = 1) {
  const { qty, qtyMax } = scaledQty(ing, factor);
  if (qty === null) return '';
  const unit = ing.unit ? ` ${unitLabel(ing.unit, qtyMax ?? qty)}` : '';
  return `${formatRange(qty, qtyMax, ing.unit)}${unit}`;
}

/** Portions affichées après mise à l'échelle : « 4 », « 4,8 (≈ 5) ». */
export function formatServings(base, factor) {
  if (!base) return '';
  const v = base * factor;
  const r1 = Math.round(v * 10) / 10;
  if (Math.abs(r1 - Math.round(r1)) < 1e-9) return String(Math.round(r1));
  return `${String(r1).replace('.', ',')} (≈ ${Math.max(1, Math.round(v))})`;
}

/** Conversion vers l'unité de base de la famille (g ou ml), pour additionner. */
export function toBase(qty, unit) {
  const f = TO_BASE[unit];
  return f ? { qty: qty * f, unit: unitKind(unit) === 'mass' ? 'g' : 'ml' } : { qty, unit };
}

// --- Texte libre ⇄ liste structurée (formulaire) ------------------------------

/**
 * Texte du formulaire → ingrédients. Une ligne par ingrédient ; une ligne
 * finissant par « : » (ou commençant par #) ouvre un sous-groupe.
 */
export function parseIngredientsText(text) {
  const out = [];
  let group = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const header = t.match(/^#+\s*(.+)$/) || (t.endsWith(':') && !/^\d/.test(t) ? [t, t.slice(0, -1)] : null);
    if (header) {
      group = header[1].replace(/\s*:\s*$/, '').trim() || null;
      continue;
    }
    const ing = parseIngredientLine(t);
    if (group) ing.group = group;
    out.push(ing);
  }
  return out;
}

export function ingredientsToText(ingredients = []) {
  const lines = [];
  let group = null;
  for (const ing of ingredients) {
    if ((ing.group || null) !== group) {
      group = ing.group || null;
      if (group) {
        if (lines.length) lines.push('');
        lines.push(`${group} :`);
      }
    }
    lines.push(ingredientToLine(ing));
  }
  return lines.join('\n');
}

/**
 * Réglages Thermomix copiés depuis Cookidoo : les icônes disparaissent au
 * copier-coller (« 120°C//vitesse . »). On remet Ⓡ (sens inverse) et Ⓢ
 * (vitesse mijotage), seuls réglages affichés en icône.
 */
// Icône copiée depuis le site (police d'icônes) : caractère privé, ou carré de remplacement.
const ICON = '[\\uE000-\\uF8FF\\u2261-\\u2263\\u25A1\\uFFFD]';
const ICON_RE = new RegExp(ICON, 'g');
const REVERSE_ICON = new RegExp(`/\\s*${ICON}\\s*/\\s*(vitesse|vit\\.)`, 'gi');
const STIR_ICON = new RegExp(`\\b(vitesse|vit\\.)\\s*${ICON}`, 'gi');

export function fixThermomixIcons(text) {
  return String(text)
    .replace(REVERSE_ICON, '/Ⓡ/$1')
    .replace(STIR_ICON, 'vitesse Ⓢ')
    .replace(ICON_RE, '')
    .replace(/\/\s*\/\s*(vitesse|vit\.)/gi, '/Ⓡ/$1')
    .replace(/\bvitesse\s*(?=[.,;)]|$)/gi, 'vitesse Ⓢ');
}

const STEP_NUMBER = /^(?:(?:[ée]tape|step)\s*)?\d{1,2}\s*[.):]?$/i;
const STEPS_TITLE = /^(?:pr[ée]paration|[ée]tapes?(?:\s+de\s+(?:la\s+)?(?:pr[ée]paration|recette))?|instructions?)\s*:?$/i;
const TIPS_TITLE = /^(astuces?|conseils?|variantes?)\s*:?$/i;

/**
 * Étapes : une par ligne (ou paragraphe) ; « # Titre » pour une section.
 * Accepte aussi les étapes copiées d'un site (Cookidoo…) : numéros seuls sur
 * leur ligne et titre « Préparation » ignorés, « Astuces » devient une partie.
 */
export function parseStepsText(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.replace(/\u00a0/g, ' ').trim();
    if (!t || STEP_NUMBER.test(t) || STEPS_TITLE.test(t)) continue;
    const sec = t.match(/^#+\s*(.+)$/) || t.match(TIPS_TITLE);
    if (sec) out.push({ section: sec[1].trim().replace(/^./, (c) => c.toUpperCase()) });
    else out.push({ text: fixThermomixIcons(t.replace(/^(?:(?:[ée]tape|step)\s*)?\d{1,2}\s*(?:[.):]|\s-)\s+/i, '')) });
  }
  return out;
}

export function stepsToText(steps = []) {
  return steps.map((s) => (s.section ? `# ${s.section}` : s.text)).join('\n');
}
