// « Coller une recette » : transforme un texte libre (notes du téléphone,
// message, page web copiée) en recette structurée. Logique pure, testée.
//
// Le texte peut avoir des titres de parties (« Ingrédients », « Préparation »…)
// ou non : chaque ligne est alors classée d'après sa forme (quantité en tête,
// phrase longue, numéro d'étape…).
import { fixThermomixIcons, parseIngredientLine, parseIngredientsText } from './quantities.js';
import { detectSourceType, normalizeUrl } from './sources.js';

const BULLET = /^\s*(?:[-–—•*·▪◦●○▢☐✓✔→>]+|\(\s*\)|\[\s*[xX ]?\s*\])\s*/;
const NUMBERED = /^\s*(?:(?:[ée]tape|step)\s*)?(\d{1,2})\s*(?:[.)\]:–-]|\/)\s*/i;

const HEADERS = [
  ['ingredients', /^(?:les\s+)?(?:ingr[ée]dients?|liste\s+des\s+ingr[ée]dients|il\s+(?:vous\s+)?faut|ce\s+qu['’]il\s+(?:vous\s+)?faut|courses)\b/i],
  ['steps', /^(?:la\s+)?(?:pr[ée]paration|[ée]tapes?|instructions?|r[ée]alisation|recette|m[ée]thode|d[ée]roul[ée]|progression|pr[ée]parer)\b/i],
  ['notes', /^(?:notes?|astuces?|conseils?|remarques?|variantes?|le\s+petit\s+plus|info(?:rmation)?s?|nb)\b/i],
  ['tools', /^(?:accessoires?|ustensiles?|mat[ée]riel)(?:\s+n[ée]cessaires?)?\b/i],
  ['skip', /^(?:nutrition|valeurs?\s+nutritionnelles?|apports?\s+nutritionnels?|informations?\s+nutritionnelles?)\b/i],
];

// Éléments des pages de recettes (Cookidoo, sites) sans intérêt ici :
// note et nombre d'avis, difficulté, valeurs nutritionnelles…
const NOISE = /^(?:tr[eè]s\s+facile|facile|moyen(?:ne)?|difficile|interm[ée]diaire|avanc[ée])$|^(?:difficult[ée]|niveau|co[uû]t|budget)\b|^\d+(?:[.,]\d+)?\s*(?:\/\s*5)?\s*\(?\s*\d*\s*(?:avis|[ée]valuations?|notes?|votes?)\s*\)?$|\b\d+\s*(?:k?cal|kj)\b|^(?:prot[ée]ines|glucides|lipides|fibres|calories|sodium|graisses|acides\s+gras|sel)\s*:?\s*\d/i;

/** Réglages Thermomix dans le texte des étapes : « 10 sec/vitesse 6 », « 3 min/100°C/Ⓡ/vitesse Ⓢ ». */
export const TM_SETTING = /(?:\d+(?:[.,]\d+)?\s*(?:sec|min|h)(?:\s*\d+\s*(?:sec|min))?\s*\/\s*)?(?:(?:\d+\s*°C?|Varoma)\s*\/\s*)?(?:Ⓡ\s*\/\s*|sens\s+inverse\s*\/\s*)?(?:vitesse|vit\.)\s*(?:\d+(?:[.,]\d+)?|Ⓢ|mijotage|turbo|cuill[eè]re)|\bturbo\s*\/\s*\d+(?:[.,]\d+)?\s*sec\b|\b(?:mode\s+)?(?:cuisson\s+du\s+sucre|cuisson\s+lente|sous[- ]vide|[ée]paississement)\b(?:\s*\/\s*\d+\s*°C)?|\bmode\s+(?:p[ée]trin|turbo|fermentation|rissoler)\b/gi;

const DURATION = '(\\d+\\s*(?:h|heures?)\\s*(?:\\d+\\s*(?:min(?:utes?)?|mn)?)?|\\d+\\s*(?:min(?:utes?)?|mn))';
const TIME_RE = new RegExp(
  `(temps\\s+de\\s+)?(pr[ée]paration|pr[ée]pa|cuisson|repos|r[ée]frig[ée]ration|attente|marinade|temps\\s+total|total)\\s*(?:[:\\-–]\\s*)?${DURATION}`,
  'gi',
);
const SERVINGS_RE = /(?:pour|portions?\s*:?|nombre\s+de\s+parts?\s*:?|quantit[ée]\s*:?)\s*(\d{1,3})\s*(personnes?|pers\.?|parts?|portions?|gourmands?|convives?|pi[eè]ces?|enfants?|adultes?)?|^(\d{1,3})\s*(personnes?|pers\.?|parts|portions|convives)\b/i;

function cleanLine(l) {
  return l.replace(/ /g, ' ').replace(/\*\*|__/g, '').replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
}

export function parseDuration(s) {
  const t = s.toLowerCase();
  const h = t.match(/(\d+)\s*(?:h|heure)/);
  const m = t.match(/(?:h|heures?)\s*(\d+)|(\d+)\s*(?:min|mn)/);
  let total = h ? Number(h[1]) * 60 : 0;
  if (m) total += Number(m[1] || m[2]);
  return total || null;
}

/** Temps et portions d'une ligne ; `only` vaut true si la ligne ne contient rien d'autre. */
export function readMeta(line) {
  const meta = {};
  let rest = line;
  for (const m of line.matchAll(TIME_RE)) {
    const label = m[2].toLowerCase();
    const min = parseDuration(m[3]);
    if (!min) continue;
    if (label.startsWith('pr')) meta.prepMin = min;
    else if (label === 'cuisson') meta.cookMin = min;
    else if (label.includes('total')) meta.totalMin = min;
    else meta.restMin = (meta.restMin || 0) + min;
    rest = rest.replace(m[0], ' ');
  }
  const s = rest.match(SERVINGS_RE);
  if (s) {
    meta.servings = Number(s[1] || s[3]);
    const unit = (s[2] || s[4] || '').toLowerCase();
    if (unit && !/^(personnes?|pers\.?|portions?|parts?|convives?|gourmands?|adultes?)$/.test(unit)) meta.servingsLabel = unit;
    rest = rest.replace(s[0], ' ');
  }
  const only = Object.keys(meta).length > 0 && !/[a-zà-ÿ]{3,}/i.test(rest.replace(/\b(et|de|du|temps|environ|env\.?|total)\b/gi, ''));
  return { meta, only };
}

function headerOf(line) {
  const t = line.replace(BULLET, '');
  for (const [kind, re] of HEADERS) {
    const m = t.match(re);
    if (!m) continue;
    const after = t.slice(m[0].length).replace(/^\s*\([^)]*\)/, '').trim();
    // « Préparation : 20 min » est un temps, pas un titre de partie.
    if (kind === 'steps' && /^[:\-–]?\s*\d/.test(after)) return null;
    const words = t.split(/\s+/).length;
    if (after === '' || after === ':' || /^[:\-–]\s*$/.test(after) || (words <= 6 && /:\s*$/.test(t))) {
      return { kind, inline: null, line: t };
    }
    if (/^[:\-–]/.test(after) && kind === 'ingredients') return { kind, inline: after.replace(/^[:\-–]\s*/, ''), line: t };
    if (/^[:\-–]/.test(after) && kind === 'notes') return { kind, inline: after.replace(/^[:\-–]\s*/, ''), line: t };
  }
  return null;
}

/** Sous-partie d'une liste d'ingrédients écrite sans « : » (« Pâte brisée », « Garniture »). */
const GROUP_WORDS = /^(?:pour\s+(?:la|le|les|l['’]|un|une)\s|p[âa]te\b|garniture|sauce\b|cr[èe]me\s+(?:p[âa]tissi[èe]re|anglaise|mousseline|au\s|à\s|d['’])|d[ée]cor(?:ation)?\b|gla[çc]age|finition|marinade|appareil|biscuit\b|ganache|farce\b|topping|coulis|montage|meringue|crumble|streusel|accompagnement|vinaigrette)/i;
function isGroupTitle(l) {
  const t = l.replace(BULLET, '').replace(/\s*:\s*$/, '').trim();
  return t.split(/\s+/).length <= 5 && GROUP_WORDS.test(t) && parseIngredientLine(t).qty === undefined && !/[.!?]$/.test(t);
}

/** « 200 g » ou « 3 » seuls sur une ligne : la suite de l'ingrédient est à la ligne suivante. */
function quantityOnly(l) {
  const t = l.replace(BULLET, '').trim();
  const p = parseIngredientLine(t);
  return p.qty !== undefined && p.name === t;
}

const isUrl = (l) => /^(?:https?:\/\/|www\.)\S+$/i.test(l);

function looksLikeStep(l) {
  const t = l.replace(BULLET, '');
  if (NUMBERED.test(l) && t.replace(NUMBERED, '').split(/\s+/).length >= 3 && !/^\d+\s*(g|kg|cl|ml|l)\b/i.test(t)) return true;
  const words = t.split(/\s+/).length;
  if (t.length > 90) return true;
  if (words >= 7 && /[.!]$/.test(t)) return true;
  // Phrase courte terminée par un point, sans quantité : « Tout mélanger dans un bol. »
  if (words >= 4 && /[.!]$/.test(t) && parseIngredientLine(t).qty === undefined) return true;
  // Verbe à l'infinitif ou à l'impératif en tête : « Préchauffer le four », « Mélangez… »
  if (words >= 3 && /^[A-ZÀ-Ý][a-zà-ÿ]+(?:er|ir|re|ez|ssez)\b/.test(t) && !parseIngredientLine(t).qty) return true;
  return false;
}

function looksLikeIngredient(l) {
  const t = l.replace(BULLET, '');
  if (!t || t.length > 90) return false;
  if (/[.!?]$/.test(t) && t.split(/\s+/).length > 6) return false;
  const p = parseIngredientLine(t);
  if (p.qty !== undefined) return true;
  return t.split(/\s+/).length <= 5 && !/[.!?]$/.test(t);
}

/**
 * Texte → brouillon de recette { title, servings?, prepMin?, cookMin?, restMin?,
 * ingredients, steps, notes?, source? }. Rien n'est inventé : ce qui n'est pas
 * reconnu part dans les notes.
 */
export function parseRecipeText(text) {
  const raw = String(text || '').split(/\r?\n/).map(cleanLine);
  const out = { title: '', ingredients: [], steps: [], notes: '' };
  const ingLines = [];
  const notes = [];
  const tools = [];
  let source = null;
  let pendingQty = null;
  let mode = null; // null (automatique) | 'ingredients' | 'steps' | 'notes'
  let autoSteps = false;
  let lastStep = null;
  let blank = false;

  const applyMeta = (meta) => {
    for (const k of ['servings', 'servingsLabel', 'prepMin', 'cookMin', 'restMin']) if (meta[k] && !out[k]) out[k] = meta[k];
    if (meta.totalMin && !out.prepMin && !out.cookMin) out.totalMin = meta.totalMin;
  };

  const addStep = (line) => {
    const numbered = NUMBERED.test(line);
    const t = fixThermomixIcons(line.replace(BULLET, '').replace(NUMBERED, '').trim());
    if (!t) return;
    // Petit titre de partie : « Pour la pâte : », « La sauce : »
    if (/:\s*$/.test(t) && t.split(/\s+/).length <= 6) {
      out.steps.push({ section: t.replace(/\s*:\s*$/, '') });
      lastStep = null;
      return;
    }
    // Suite d'une phrase coupée par un retour à la ligne.
    if (lastStep && !numbered && !blank && /^[a-zà-ÿ(]/.test(t) && !/[.!?:]$/.test(lastStep.text)) {
      lastStep.text += ` ${t}`;
      return;
    }
    lastStep = { text: t };
    out.steps.push(lastStep);
  };

  for (const line of raw) {
    if (!line) {
      blank = true;
      continue;
    }
    const wasBlank = blank;
    blank = false;
    // Liens et source
    const src = line.match(/^source\s*:?\s*(.*)$/i);
    if (src) {
      const url = src[1].match(/(https?:\/\/\S+|www\.\S+)/i)?.[1];
      source = { ...(source || {}), title: src[1].replace(url || '', '').trim() || source?.title, url: url || source?.url };
      continue;
    }
    if (isUrl(line)) {
      source = { ...(source || {}), url: line };
      continue;
    }
    if (NOISE.test(line)) continue;
    const header = headerOf(line);
    if (header) {
      if (pendingQty) ingLines.push(pendingQty);
      pendingQty = null;
      mode = header.kind;
      autoSteps = false;
      lastStep = null;
      const { meta } = readMeta(header.line);
      applyMeta(meta);
      if (header.inline) {
        if (mode === 'ingredients') {
          for (const part of header.inline.split(/\s*[;,]\s*(?=\d|[a-zà-ÿ])/i)) if (part) ingLines.push(part);
        } else notes.push(header.inline);
      }
      continue;
    }
    const { meta, only } = readMeta(line);
    if (only && (mode !== 'steps' || !lastStep)) {
      applyMeta(meta);
      continue;
    }
    if (!out.title) {
      out.title = line.replace(/^recette\s*(?:de|du|des|:)?\s*/i, '').replace(/\s*:\s*$/, '');
      out.title = out.title.charAt(0).toUpperCase() + out.title.slice(1);
      continue;
    }
    if (mode === 'skip') continue;
    if (mode === 'tools') {
      tools.push(line.replace(BULLET, ''));
      continue;
    }
    if (mode === 'notes') {
      notes.push(line);
      continue;
    }
    if ((mode === 'steps' || autoSteps) && /^\d{1,2}\.?$/.test(line)) continue; // numéro d'étape seul
    if (mode === 'steps' || autoSteps) {
      blank = wasBlank;
      addStep(line);
      blank = false;
      continue;
    }
    // Quantité seule (« 200 g ») : collée à la ligne suivante (« farine »).
    if (pendingQty) {
      const merged = `${pendingQty} ${line.replace(BULLET, '')}`;
      pendingQty = null;
      ingLines.push(merged);
      continue;
    }
    if (mode !== 'steps' && quantityOnly(line)) {
      pendingQty = line.replace(BULLET, '').trim();
      continue;
    }
    if ((mode === 'ingredients' || (!mode && !autoSteps)) && isGroupTitle(line)) {
      ingLines.push(`${line.replace(BULLET, '').replace(/\s*:\s*$/, '')} :`);
      continue;
    }
    if (mode === 'ingredients') {
      if (looksLikeStep(line) && ingLines.length) {
        autoSteps = true;
        addStep(line);
      } else if (/:\s*$/.test(line) && !parseIngredientLine(line.replace(/:\s*$/, '')).qty) {
        ingLines.push(line.replace(BULLET, '')); // sous-groupe « Pour la sauce : »
      } else {
        ingLines.push(line.replace(BULLET, ''));
      }
      continue;
    }
    // Pas de titre de partie : on devine.
    if (looksLikeStep(line)) {
      autoSteps = true;
      addStep(line);
    } else if (looksLikeIngredient(line)) {
      ingLines.push(line.replace(BULLET, ''));
    } else {
      notes.push(line);
    }
  }

  if (pendingQty) ingLines.push(pendingQty);
  out.ingredients = parseIngredientsText(ingLines.join('\n'));
  if (tools.length) notes.push(`Accessoires : ${tools.join(', ')}`);
  if (notes.length) out.notes = notes.join('\n');
  if (out.totalMin && !out.prepMin) out.prepMin = out.totalMin;
  delete out.totalMin;
  if (source?.url || source?.title) {
    const url = normalizeUrl(source.url);
    // « Source : Nadine » : un prénom, donc une recette d'un proche.
    const short = source.title && source.title.split(/\s+/).length <= 3 && !/[.]/.test(source.title);
    const type = url ? detectSourceType(url) : short ? 'perso' : 'autre';
    const title = source.title || { cookidoo: 'Cookidoo', chronodrive: 'Chronodrive', quitoque: 'Quitoque' }[type];
    out.source = { type, ...(title ? { title } : {}), ...(url ? { url } : {}) };
  }
  if (!out.title) out.title = 'Recette sans titre';
  return out;
}
