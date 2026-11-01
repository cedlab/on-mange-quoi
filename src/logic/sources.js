// Source d'une recette (obligatoire) : d'où vient-elle ?
// { type, title?, url?, page?, author? }

export const SOURCE_TYPES = [
  { id: 'livre', label: 'Livre', emoji: '📕' },
  { id: 'pdf', label: 'PDF', emoji: '📄' },
  { id: 'web', label: 'Site web', emoji: '🌐' },
  { id: 'cookidoo', label: 'Cookidoo', emoji: '🥣' },
  { id: 'chronodrive', label: 'Chronodrive', emoji: '🛒' },
  { id: 'magazine', label: 'Magazine', emoji: '📰' },
  { id: 'perso', label: 'Perso / un proche', emoji: '👵' },
  { id: 'autre', label: 'Autre', emoji: '✳️' },
];

const BY_ID = Object.fromEntries(SOURCE_TYPES.map((t) => [t.id, t]));

export function sourceType(id) {
  return BY_ID[id] || BY_ID.autre;
}

/** Type deviné d'après une adresse collée (Cookidoo, Chronodrive, site). */
export function detectSourceType(url) {
  const host = hostOf(url);
  if (!host) return null;
  if (/(^|\.)cookidoo\./.test(host)) return 'cookidoo';
  if (/(^|\.)chronodrive\./.test(host)) return 'chronodrive';
  return 'web';
}

export function hostOf(url) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Ajoute https:// si besoin ; renvoie '' si ce n'est pas une adresse web. */
export function normalizeUrl(url) {
  const t = String(url || '').trim();
  if (!t) return '';
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes('.')) return '';
    return u.href;
  } catch {
    return '';
  }
}

/** Erreur lisible si la source est incomplète, sinon null. */
export function validateSource(src) {
  if (!src || !src.type) return 'Indique la source de la recette.';
  if (!BY_ID[src.type]) return 'Type de source inconnu.';
  const hasTitle = Boolean(String(src.title || '').trim());
  const hasUrl = Boolean(normalizeUrl(src.url));
  if (src.url && !hasUrl) return "L'adresse web n'est pas valide.";
  if (['web', 'cookidoo', 'chronodrive'].includes(src.type) && !hasUrl && !hasTitle) {
    return 'Colle le lien de la recette (ou au moins le nom du site).';
  }
  if (!['web', 'cookidoo', 'chronodrive'].includes(src.type) && !hasTitle) {
    return {
      livre: 'Indique le titre du livre.',
      pdf: 'Indique le nom du PDF.',
      magazine: 'Indique le nom du magazine.',
      perso: 'Indique de qui vient la recette (ou « Moi »).',
    }[src.type] || 'Précise la source.';
  }
  if (src.page !== undefined && src.page !== null && src.page !== '' && !(Number(src.page) > 0)) {
    return 'Le numéro de page doit être un nombre.';
  }
  return null;
}

/** Nettoie une source saisie (champs vides retirés, URL normalisée). */
export function cleanSource(src) {
  const out = { type: src.type };
  const title = String(src.title || '').trim();
  if (title) out.title = title;
  const url = normalizeUrl(src.url);
  if (url) out.url = url;
  const page = Number(src.page);
  if (page > 0) out.page = Math.round(page);
  const author = String(src.author || '').trim();
  if (author) out.author = author;
  return out;
}

/** Texte court : « Livre · Larousse de la cuisine, p. 42 ». */
export function sourceLabel(src) {
  if (!src) return 'Source inconnue';
  const t = sourceType(src.type);
  const name = src.title || hostOf(src.url) || '';
  const page = src.page ? `, p. ${src.page}` : '';
  const author = src.author ? ` (${src.author})` : '';
  return name ? `${name}${author}${page}` : t.label;
}

/** Libellé du bouton qui ouvre la recette d'origine. */
export function openLabel(src) {
  if (!src?.url) return null;
  if (src.type === 'cookidoo') return 'Ouvrir dans Cookidoo';
  if (src.type === 'chronodrive') return 'Ouvrir sur Chronodrive';
  return `Ouvrir sur ${hostOf(src.url)}`;
}
