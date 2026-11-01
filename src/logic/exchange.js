// Fichier d'échange JSON (import de recettes, sauvegarde).
// Format : { format: "on-mange-quoi/recettes", version: 1, recipes: [ … ] }
// Chaque recette peut porter une photo « data:image/jpeg;base64,… ».
import { cleanRecipe, normalizeText, validateRecipe } from './recipes.js';

export const FORMAT = 'on-mange-quoi/recettes';
export const VERSION = 1;

const MAX_PHOTO_CHARS = 900_000; // une photo ≈ 650 Ko max (limite Firestore : 1 Mo par document)

/** Clé de doublon : même titre et même source. */
export function duplicateKey(r) {
  return `${normalizeText(r.title)}|${normalizeText(r.source?.title || r.source?.url || '')}`;
}

/**
 * Lit et vérifie un fichier d'import.
 * Retourne { items: [{ recipe, photo, duplicate }], errors: [texte], skipped }.
 */
export function parseImport(text, existing = []) {
  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new Error("Ce fichier n'est pas un JSON valide.");
  }
  if (!data || data.format !== FORMAT || !Array.isArray(data.recipes)) {
    throw new Error("Ce fichier n'est pas un fichier de recettes « On mange quoi ? ».");
  }
  if (data.version > VERSION) {
    throw new Error("Ce fichier vient d'une version plus récente de l'application : mets l'app à jour.");
  }
  const known = new Set(existing.filter((r) => !r.deleted).map(duplicateKey));
  const seen = new Set();
  const items = [];
  const errors = [];
  data.recipes.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      errors.push(`Recette n° ${i + 1} : illisible.`);
      return;
    }
    const recipe = cleanRecipe(raw);
    const err = validateRecipe(recipe);
    if (err) {
      errors.push(`« ${recipe.title || `n° ${i + 1}`} » : ${err}`);
      return;
    }
    let photo = typeof raw.photo === 'string' && raw.photo.startsWith('data:image/') ? raw.photo : null;
    if (photo && photo.length > MAX_PHOTO_CHARS) photo = null;
    const key = duplicateKey(recipe);
    const duplicate = known.has(key) || seen.has(key);
    seen.add(key);
    items.push({ recipe, photo, duplicate });
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
