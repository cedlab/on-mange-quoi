// « On mange quoi ? » : tirage d'une recette au hasard, mais pas n'importe
// comment — de saison, pas mangée récemment, plutôt bien notée.
// Logique pure (le hasard est injectable pour les tests).
import { isThermomix } from './sources.js';
import { mealLists } from './plan.js';
import { addDays } from './dates.js';
import { ingredientKey } from './aisles.js';
import { normalizeText, totalMinutes } from './recipes.js';

// Calendrier des fruits et légumes de saison en France (mois 1 à 12).
const SEASONS = {
  asperge: [4, 5, 6], artichaut: [5, 6, 7, 8, 9], aubergine: [6, 7, 8, 9], betterave: [1, 2, 3, 9, 10, 11, 12],
  blette: [6, 7, 8, 9, 10], brocoli: [6, 7, 8, 9, 10, 11], celeri: [1, 2, 3, 9, 10, 11, 12],
  champignon: [9, 10, 11], cepe: [9, 10], girolle: [7, 8, 9, 10], chou: [1, 2, 3, 10, 11, 12],
  'chou fleur': [1, 2, 3, 4, 9, 10, 11, 12], 'chou de bruxelle': [1, 2, 10, 11, 12], concombre: [5, 6, 7, 8, 9],
  courgette: [6, 7, 8, 9], endive: [1, 2, 3, 4, 10, 11, 12], epinard: [3, 4, 5, 9, 10, 11], fenouil: [6, 7, 8, 9, 10],
  'haricot vert': [6, 7, 8, 9], mache: [1, 2, 3, 10, 11, 12], navet: [1, 2, 3, 10, 11, 12], panais: [1, 2, 3, 10, 11, 12],
  'petit pois': [5, 6, 7], poireau: [1, 2, 3, 4, 9, 10, 11, 12], poivron: [7, 8, 9], potiron: [1, 2, 9, 10, 11, 12],
  potimarron: [1, 2, 9, 10, 11, 12], courge: [1, 2, 9, 10, 11, 12], butternut: [1, 2, 9, 10, 11, 12], radis: [4, 5, 6, 7],
  tomate: [6, 7, 8, 9], topinambour: [1, 2, 3, 10, 11, 12], mais: [8, 9], feve: [5, 6], 'pois gourmand': [5, 6, 7],
  'patate douce': [1, 2, 10, 11, 12], salsifi: [1, 2, 11, 12], 'chou rouge': [1, 2, 10, 11, 12],
  abricot: [6, 7, 8], cerise: [5, 6, 7], fraise: [4, 5, 6, 7], framboise: [6, 7, 8, 9], melon: [6, 7, 8, 9],
  pasteque: [7, 8], peche: [6, 7, 8, 9], nectarine: [6, 7, 8, 9], prune: [7, 8, 9], mirabelle: [8, 9], figue: [8, 9, 10],
  raisin: [8, 9, 10], myrtille: [7, 8], rhubarbe: [4, 5, 6], cassis: [6, 7], groseille: [6, 7, 8], coing: [10, 11],
  chataigne: [10, 11, 12], marron: [10, 11, 12], clementine: [1, 2, 11, 12], mandarine: [1, 2, 11, 12],
  orange: [1, 2, 3, 4, 12], pamplemousse: [1, 2, 3, 4, 12], kiwi: [1, 2, 3, 4, 11, 12], poire: [1, 2, 3, 8, 9, 10, 11, 12],
  pomme: [1, 2, 3, 4, 8, 9, 10, 11, 12], noix: [9, 10, 11],
};
// Toute l'année (conserves, produits secs, cultures sous abri) : ni bonus ni malus.
const ALL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
for (const k of ['pomme de terre', 'noix de coco', 'noix de muscade', 'noix de cajou', 'concentre de tomate', 'coulis de tomate',
  'tomate concassee', 'tomate pelee', 'pulpe de tomate', 'tomate sechee', 'sauce tomate', 'champignon de paris', 'raisin sec',
  'abricot sec', 'pruneau', 'creme de marron', 'puree de marron', 'mais doux', 'petit pois surgele', 'haricot vert surgele',
  'jus de citron', 'jus d\'orange', 'eau de fleur d\'oranger', 'confiture']) SEASONS[k] = ALL_YEAR;
const SEASON_KEYS = Object.keys(SEASONS).sort((a, b) => b.length - a.length);

// Plats « réconfort » (hiver) et plats « fraîcheur » (été).
const COZY = /gratin|soupe|potage|veloute|pot au feu|pot-au-feu|choucroute|blanquette|bourguignon|daube|cassoulet|hachis|potee|mijot|raclette|tartiflette|fondue|ragout|civet|lasagne|parmentier|puree|risotto|chili|tajine|couscous|braise|carbonade|croziflette|garbure|petit sale|osso buco|navarin|vin chaud|chocolat chaud|crumble/;
const FRESH = /salade|gaspacho|gazpacho|barbecue|grillade|plancha|brochette|tarte aux fraises|glace|sorbet|taboule|carpaccio|tartare|ceviche|tian|ratatouille|melon|pasteque|smoothie|bruschetta|vitello|wrap|pique nique|frais|fraicheur|poke|granite|panna cotta|tiramisu aux fraises/;
// Petits rendez-vous de l'année.
const EVENTS = [
  { months: [12], re: /buche|foie gras|chapon|marron|pain d'epice|bredele|sables de noel|noel/, label: '🎄 C’est bientôt Noël' },
  { months: [1], re: /galette des rois|frangipane/, label: '👑 La galette des rois' },
  { months: [2], re: /crepe|beignet|gaufre|bugne|merveille/, label: '🥞 Chandeleur et Mardi gras' },
  { months: [3, 4], re: /agneau|paques|chocolat|oeufs? mimosa|asperge/, label: '🐣 Pâques' },
  { months: [10], re: /potiron|citrouille|halloween|courge/, label: '🎃 Halloween' },
];

const BASES = /^(?:ganache|pate (?:brisee|sablee|feuilletee|a choux|a pizza|a crepe)|sauce|coulis|glacage|creme (?:patissiere|anglaise|chantilly|au beurre)|chantilly|vinaigrette|beurre|marinade|fond|bouillon|caramel|meringue|biscuit (?:roule|a la cuillere)|confiture|sirop|poudre|mayonnaise|pesto|pralin)/;

const MONTH_LABEL = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Saisonnalité des ingrédients d'une recette pour un mois (1-12). */
export function seasonality(recipe, month) {
  const inSeason = [];
  const outSeason = [];
  for (const ing of recipe.ingredients || []) {
    const key = ingredientKey(ing.name);
    const found = SEASON_KEYS.find((k) => key === k || key.startsWith(`${k} `) || key.includes(` ${k}`) || key.endsWith(` ${k}`));
    if (!found || SEASONS[found] === ALL_YEAR) continue;
    const label = ing.name.toLowerCase();
    if (SEASONS[found].includes(month)) {
      if (!inSeason.includes(label)) inSeason.push(label);
    } else if (!outSeason.includes(label)) outSeason.push(label);
  }
  return { inSeason, outSeason };
}

/** Dernière date où chaque recette a été planifiée (avant ou à partir d'aujourd'hui). */
export function lastPlanned(plans) {
  const last = new Map();
  for (const plan of Object.values(plans || {})) {
    for (const [date, slots] of Object.entries(plan.days || {})) {
      for (const list of mealLists(slots)) {
        for (const e of list || []) {
          if (e.recipeId && (!last.has(e.recipeId) || last.get(e.recipeId) < date)) last.set(e.recipeId, date);
        }
      }
    }
  }
  return last;
}

function weeksSince(from, to) {
  return Math.floor((Date.parse(to) - Date.parse(from)) / (7 * 86_400_000));
}

/**
 * Score et raisons d'une recette.
 * ctx : { month, today, last: Map, season: bool }
 */
export function scoreRecipe(r, { month, today, last = new Map(), season = true }) {
  let score = 0;
  const reasons = [];
  const text = normalizeText(`${r.title} ${(r.tags || []).join(' ')}`);
  if (season) {
    const { inSeason, outSeason } = seasonality(r, month);
    if (inSeason.length) {
      score += Math.min(3, inSeason.length) * 1.2;
      reasons.push(`🌱 De saison : ${inSeason.slice(0, 3).join(', ')}`);
    }
    if (outSeason.length) score -= Math.min(3, outSeason.length) * 1.5;
    const winter = [11, 12, 1, 2, 3].includes(month);
    const summer = [6, 7, 8].includes(month);
    if (COZY.test(text)) {
      if (winter) {
        score += 1.5;
        reasons.push('🧣 Un plat réconfortant pour la saison');
      } else if (summer) score -= 2;
    }
    if (FRESH.test(text)) {
      if (summer) {
        score += 1.5;
        reasons.push('☀️ Frais pour l’été');
      } else if (winter) score -= 1;
    }
    for (const ev of EVENTS) {
      if (ev.months.includes(month) && ev.re.test(text)) {
        score += 2.5;
        reasons.push(ev.label);
      }
    }
  }
  // Préparations de base (ganache, pâte, sauce…) : ce n'est pas un repas.
  if (!r.category && BASES.test(normalizeText(r.title))) score -= 3;
  if (['sauce', 'boisson'].includes(r.category)) score -= 3;
  const rating = r.rating || 0;
  if (rating >= 4) {
    score += (rating - 3) * 0.8;
    reasons.push(`⭐ ${String(rating).replace('.', ',')} / 5`);
  } else if (rating && rating <= 2) score -= 1.5;
  const lp = last.get(r.id);
  if (lp && lp > addDays(today, -21) && lp <= addDays(today, 14)) {
    score -= 6;
    reasons.push(lp >= today ? '📅 Déjà prévue prochainement' : '🔁 Au menu ces 3 dernières semaines');
  } else if (lp && lp < today) {
    const w = weeksSince(lp, today);
    if (w >= 6) {
      score += Math.min(2, w / 8);
      reasons.push(`⏳ Pas au menu depuis ${w >= 8 ? `${Math.round(w / 4.3)} mois` : `${w} semaines`}`);
    }
  }
  return { score, reasons };
}

/**
 * Filtres : { categories: [], quick: bool, season: bool, wellRated: bool, thermomix: bool }
 */
export function candidates(recipes, filters = {}) {
  const cats = new Set(filters.categories || []);
  return recipes.filter((r) => {
    if (r.deleted) return false;
    if (cats.size && !cats.has(r.category)) return false;
    if (filters.quick) {
      const t = totalMinutes(r);
      if (!t || t > 30) return false;
    }
    if (filters.wellRated && (r.rating || 0) < 4) return false;
    if (filters.thermomix && !isThermomix(r)) return false;
    return true;
  });
}

/**
 * Propositions classées par tirage pondéré (meilleur score = plus de chances,
 * sans jamais exclure complètement). Retourne [{ recipe, score, reasons }].
 */
export function suggest(recipes, { plans = {}, today, filters = {}, count = 4, exclude = [], rng = Math.random } = {}) {
  const month = Number(today.slice(5, 7));
  const last = lastPlanned(plans);
  const ex = new Set(exclude);
  let pool = candidates(recipes, filters).filter((r) => !ex.has(r.id))
    .map((r) => ({ recipe: r, ...scoreRecipe(r, { month, today, last, season: filters.season !== false }) }));
  const out = [];
  while (out.length < count && pool.length) {
    const weights = pool.map((p) => Math.exp(Math.max(-8, Math.min(8, p.score)) / 1.5));
    const total = weights.reduce((a, b) => a + b, 0);
    let x = rng() * total;
    let i = 0;
    while (i < pool.length - 1 && x >= weights[i]) x -= weights[i++];
    out.push(pool[i]);
    pool = pool.filter((_, j) => j !== i);
  }
  return out;
}

export function monthLabel(today) {
  return MONTH_LABEL[Number(today.slice(5, 7)) - 1];
}
