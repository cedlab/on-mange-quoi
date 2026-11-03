// Ingrédients : clé commune (pour compter et comparer) et produits de base.
import { normalizeText } from './recipes.js';

const KEEP_S = new Set(['ananas', 'anchois', 'gras', 'jus', 'mais', 'noix', 'pois', 'radis', 'riz', 'avis', 'frais', 'bras', 'cassis', 'brebis', 'pancetta', 'paris', 'gros', 'tapas', 'couscous', 'bas', 'dos', 'puis', 'sans', 'sous', 'plus', 'tres', 'moins']);

function singular(word) {
  if (word.length <= 3 || KEEP_S.has(word)) return word;
  if (word.endsWith('eaux')) return word.slice(0, -1);
  if (word.endsWith('aux') && !word.endsWith('eaux')) return `${word.slice(0, -3)}al`;
  if (/[sx]$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Clé d'un ingrédient pour additionner les quantités : minuscules, sans
 * accents, au singulier, sans les précisions entre parenthèses.
 * « Œufs » = « oeuf » ; « Carottes » = « carotte ».
 */
export function ingredientKey(name) {
  return normalizeText(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ')
    .trim();
}

// Ingrédients de base qu'on a presque toujours : regroupés à part.
const STAPLES = /^(?:sel|poivre|sel et poivre|sel poivre|poivre du moulin|fleur de sel|gros sel|sel fin|eau|eau froide|eau chaude|eau tiede|eau bouillante|glacon|huile|huile d'olive|huile de tournesol|huile neutre|filet d'huile|un peu d'huile)$/;

export function isStaple(name) {
  return STAPLES.test(ingredientKey(name));
}
