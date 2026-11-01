// Fichier d'échange JSON (import de recettes, sauvegarde).
// Format : { format: "on-mange-quoi/recettes", version: 1, recipes: [ … ] }
// Chaque recette peut porter une photo « data:image/jpeg;base64,… ».
import { cleanRecipe, normalizeText, validateRecipe } from './recipes.js';
import { parseIngredientsText, parseStepsText } from './quantities.js';

export const FORMAT = 'on-mange-quoi/recettes';
export const VERSION = 1;

const MAX_PHOTO_CHARS = 900_000; // une photo ≈ 650 Ko max (limite Firestore : 1 Mo par document)

/** Clé de doublon : même titre et même source. */
export function duplicateKey(r) {
  return `${normalizeText(r.title)}|${normalizeText(r.source?.title || r.source?.url || '')}`;
}

/**
 * Ingrédients et étapes écrits en texte (« 200 g de farine », « # La pâte »)
 * plutôt qu'en objets : convertis. Utile pour un JSON préparé par un assistant.
 */
function normalizeRaw(raw) {
  const r = { ...raw };
  if (Array.isArray(r.ingredients) && r.ingredients.some((i) => typeof i === 'string')) {
    // Lues ensemble pour garder les sous-groupes (« Pâte : » puis ses ingrédients).
    r.ingredients = r.ingredients.every((i) => typeof i === 'string')
      ? parseIngredientsText(r.ingredients.join('\n'))
      : r.ingredients.flatMap((i) => (typeof i === 'string' ? parseIngredientsText(i) : [i]));
  }
  if (Array.isArray(r.steps) && r.steps.some((x) => typeof x === 'string')) {
    r.steps = r.steps.flatMap((x) => (typeof x === 'string' ? parseStepsText(x) : [x]));
  }
  return r;
}

/** Texte collé : retire les balises ```json et accepte un tableau de recettes seul. */
function readData(text) {
  if (typeof text !== 'string') return text;
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  return JSON.parse(t);
}

/**
 * Lit et vérifie un fichier (ou un texte collé) d'import.
 * Retourne { items: [{ recipe, photo, imageUrl, duplicate }], errors: [texte] }.
 */
export function parseImport(text, existing = []) {
  let data;
  try {
    data = readData(text);
  } catch {
    throw new Error("Ce texte n'est pas un JSON valide (vérifie qu'il est copié en entier).");
  }
  if (Array.isArray(data)) data = { format: FORMAT, version: VERSION, recipes: data };
  if (data && !data.format && Array.isArray(data.recipes)) data = { ...data, format: FORMAT, version: VERSION };
  if (!data || data.format !== FORMAT || !Array.isArray(data.recipes)) {
    throw new Error("Ce fichier n'est pas un fichier de recettes « On mange quoi ? ».");
  }
  if (data.version > VERSION) {
    throw new Error("Ce fichier vient d'une version plus récente de l'application : mets l'app à jour.");
  }
  const known = new Set(existing.filter((r) => !r.deleted).map(duplicateKey));
  const knownUrls = new Set(existing.filter((r) => !r.deleted && r.source?.url).map((r) => `url|${r.source.url}`));
  const seen = new Set();
  const items = [];
  const errors = [];
  data.recipes.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      errors.push(`Recette n° ${i + 1} : illisible.`);
      return;
    }
    const recipe = cleanRecipe(normalizeRaw(raw));
    const err = validateRecipe(recipe);
    if (err) {
      errors.push(`« ${recipe.title || `n° ${i + 1}`} » : ${err}`);
      return;
    }
    let photo = typeof raw.photo === 'string' && raw.photo.startsWith('data:image/') ? raw.photo : null;
    if (photo && photo.length > MAX_PHOTO_CHARS) photo = null;
    const imageUrl = !photo && typeof raw.imageUrl === 'string' && /^https:\/\/\S+$/i.test(raw.imageUrl) ? raw.imageUrl : null;
    const key = duplicateKey(recipe);
    const urlKey = recipe.source?.url ? `url|${recipe.source.url}` : null;
    const duplicate = known.has(key) || seen.has(key) || Boolean(urlKey && (knownUrls.has(urlKey) || seen.has(urlKey)));
    seen.add(key);
    if (urlKey) seen.add(urlKey);
    items.push({ recipe, photo, imageUrl, duplicate });
  });
  return { items, errors };
}

/** Fichier de sauvegarde (même format que l'import). */
export function buildExport(recipes, photos = new Map()) {
  return {
    format: FORMAT,
    version: VERSION,
    generatedAt: new Date().toISOString(),
    recipes: recipes.filter((r) => !r.deleted).map((r) => {
      const { id, thumb, deleted, _search, createdBy, updatedBy, ...rest } = r;
      const photo = photos.get(id);
      return photo ? { ...rest, photo } : rest;
    }),
  };
}
