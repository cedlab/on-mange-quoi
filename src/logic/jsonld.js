// Recette au format standard des sites web (schema.org/Recipe, JSON-LD) →
// brouillon de recette de l'app. Logique pure, testée.
import { parseIngredientsText } from './quantities.js';
import { detectSourceType, hostOf, normalizeUrl } from './sources.js';
import { normalizeText } from './recipes.js';
import { parseRecipeText } from './text-import.js';

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  agrave: 'à', acirc: 'â', auml: 'ä', ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö', ugrave: 'ù',
  ucirc: 'û', uuml: 'ü', oelig: 'œ', OElig: 'Œ', Eacute: 'É', Egrave: 'È', Agrave: 'À', Ccedil: 'Ç', deg: '°',
  frac12: '½', frac14: '¼', frac34: '¾', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—',
};

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m);
}

/** Texte propre : entités décodées, balises HTML retirées, espaces normalisés. */
export function cleanText(s) {
  return decodeEntities(String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Durée ISO 8601 (« PT1H30M », « P0DT45M ») → minutes. */
export function isoMinutes(d) {
  if (typeof d === 'number') return d > 0 ? Math.round(d) : null;
  const m = String(d || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$/i);
  if (!m) return null;
  const min = Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return min > 0 ? Math.round(min) : null;
}

const types = (o) => [].concat(o?.['@type'] || []).map((t) => String(t).toLowerCase());

function steps(instr) {
  const out = [];
  const walk = (x, depth = 0) => {
    if (!x) return;
    if (typeof x === 'string') {
      for (const line of cleanText(x).split(/\n+/)) {
        const t = line.replace(/^\s*\d{1,2}\s*[.)-]\s+/, '').trim();
        if (t) out.push({ text: t });
      }
      return;
    }
    if (Array.isArray(x)) {
      x.forEach((y) => walk(y, depth));
      return;
    }
    const t = types(x);
    if (t.includes('howtosection')) {
      if (x.name) out.push({ section: cleanText(x.name) });
      walk(x.itemListElement || x.steps, depth + 1);
      return;
    }
    if (x.text || x.name) walk(x.text || x.name, depth);
    else if (x.itemListElement) walk(x.itemListElement, depth + 1);
  };
  walk(instr);
  return out;
}

const CATEGORY_MAP = [
  [/ap[ée]ritif|amuse|tapas|finger/, 'aperitif'],
  [/entr[ée]e|starter|appetizer/, 'entree'],
  [/dessert|g[aâ]teau|p[aâ]tisserie|cake/, 'dessert'],
  [/accompagnement|side/, 'accompagnement'],
  [/sauce|condiment|base/, 'sauce'],
  [/boisson|cocktail|drink/, 'boisson'],
  [/petit[- ]d[ée]jeuner|go[uû]ter|breakfast|brunch/, 'gouter'],
  [/plat|main|d[iî]ner|d[ée]jeuner/, 'plat'],
];

function mapCategory(cat) {
  const t = normalizeText([].concat(cat || []).join(' '));
  if (!t) return null;
  for (const [re, id] of CATEGORY_MAP) if (re.test(t)) return id;
  return null;
}

function firstImage(img) {
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return firstImage(img[0]);
  return img.url || img.contentUrl || null;
}

function servings(y) {
  const list = [].concat(y ?? []);
  for (const v of list) {
    const s = String(v);
    const m = s.match(/(\d+)/);
    if (!m) continue;
    const label = s.replace(m[0], '').replace(/[()]/g, '').trim().toLowerCase();
    const out = { servings: Number(m[1]) };
    if (label && !/^(personnes?|pers\.?|portions?|parts?|servings?|people|couverts?)$/.test(label)) out.servingsLabel = label;
    return out;
  }
  return {};
}

/**
 * Réponse du relais { url, finalUrl, recipe (JSON-LD), meta: { title, siteName, image }, text, imageData }
 * → brouillon pour le formulaire (+ photo à traiter : imageData).
 */
export function draftFromPage(page) {
  const url = normalizeUrl(page.finalUrl || page.url) || normalizeUrl(page.url);
  const type = detectSourceType(url) || 'web';
  const siteName = cleanText(page.meta?.siteName) || { chronodrive: 'Chronodrive', cookidoo: 'Cookidoo' }[type] || hostOf(url) || 'Site web';
  const source = { type, title: siteName, ...(url ? { url } : {}) };
  const r = page.recipe;
  if (r) {
    const ing = [].concat(r.recipeIngredient || r.ingredients || []).map(cleanText).filter(Boolean);
    const draft = {
      title: cleanText(r.name) || cleanText(page.meta?.title) || 'Recette',
      ...servings(r.recipeYield),
      ingredients: parseIngredientsText(ing.join('\n')),
      steps: steps(r.recipeInstructions),
      source,
      tags: type === 'cookidoo' ? ['thermomix'] : [],
    };
    const prep = isoMinutes(r.prepTime);
    const cook = isoMinutes(r.cookTime);
    const total = isoMinutes(r.totalTime);
    if (prep) draft.prepMin = prep;
    if (cook) draft.cookMin = cook;
    if (total && !prep && !cook) draft.prepMin = total;
    else if (total && prep && cook && total > prep + cook + 5) draft.restMin = total - prep - cook;
    const cat = mapCategory(r.recipeCategory);
    if (cat) draft.category = cat;
    const desc = cleanText(r.description);
    if (desc && desc.length < 600) draft.notes = desc;
    draft.imageUrl = firstImage(r.image) || page.meta?.image || null;
    return draft;
  }
  // Pas de données structurées : on analyse le texte de la page.
  const draft = parseRecipeText([cleanText(page.meta?.title), page.text || ''].filter(Boolean).join('\n'));
  draft.source = source;
  draft.imageUrl = page.meta?.image || null;
  draft.fromText = true;
  return draft;
}
