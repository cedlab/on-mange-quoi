// =============================================================================
// Relais d'import de recettes pour « On mange quoi ? » (Cloudflare Worker)
// =============================================================================
//
// Pourquoi ? L'app est un site statique : le navigateur lui interdit de lire
// une page d'un autre site (Chronodrive, Marmiton…). Ce petit relais, hébergé
// gratuitement chez Cloudflare, lit la page de la recette demandée et renvoie
// ses données (format standard schema.org/Recipe quand le site le fournit,
// sinon le texte de la page) ainsi que la photo.
//
// Sécurité : seules les personnes connectées à l'app (jeton Firebase du
// projet on-mange-quoi-a0c23) et seules les pages ouvertes depuis
// cedlab.github.io (ou localhost en développement) peuvent l'utiliser.
// Aucune donnée n'est conservée.
//
// Installation (une seule fois) :
//   1. https://dash.cloudflare.com → créer un compte gratuit.
//   2. Workers & Pages → Créer → Créer un Worker → nom « omq-recettes » → Déployer.
//   3. « Modifier le code » → remplacer tout le contenu par ce fichier → Déployer.
//   4. Copier l'adresse du Worker (https://omq-recettes.xxx.workers.dev) et la
//      coller dans l'app : Plus → Import par lien → Adresse du relais.
// =============================================================================

const PROJECT_ID = 'on-mange-quoi-a0c23';
const ALLOWED_ORIGINS = [/^https:\/\/cedlab\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_HTML = 3_000_000;
const MAX_IMAGE = 4_000_000;
const MAX_TEXT = 40_000;
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};

// --- Réponses ------------------------------------------------------------------

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(origin ? corsHeaders(origin) : {}) },
  });
}

// --- Jeton Firebase ------------------------------------------------------------

let jwksCache = { keys: null, at: 0 };

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function getKeys(fetchFn) {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3_600_000) return jwksCache.keys;
  const res = await fetchFn(JWKS_URL);
  if (!res.ok) throw new Error('Clés Google indisponibles');
  jwksCache = { keys: (await res.json()).keys || [], at: Date.now() };
  return jwksCache.keys;
}

/** Vérifie un jeton d'identité Firebase (signature RS256, projet, expiration). */
export async function verifyFirebaseToken(token, { fetchFn = fetch, now = Date.now(), projectId = PROJECT_ID } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Jeton absent ou mal formé');
  const dec = (p) => JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  const header = dec(parts[0]);
  const payload = dec(parts[1]);
  if (header.alg !== 'RS256') throw new Error('Algorithme refusé');
  const jwk = (await getKeys(fetchFn)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Clé inconnue');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('Signature invalide');
  const t = Math.floor(now / 1000);
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Jeton d’un autre projet');
  if (!(payload.exp > t) || payload.iat > t + 300) throw new Error('Jeton expiré');
  if (!payload.sub) throw new Error('Jeton sans utilisateur');
  return payload;
}

/** Réservé aux tests : vide le cache des clés. */
export function resetKeyCache() {
  jwksCache = { keys: null, at: 0 };
}

// --- Adresse demandée --------------------------------------------------------

/** Adresse web publique en https, ou null (pas d'IP, pas de réseau local). */
export function checkTarget(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || host.startsWith('[')) return null;
  u.protocol = 'https:';
  return u.href;
}

// --- Lecture de la page ------------------------------------------------------

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4]) : null;
}

/** Blocs JSON-LD, balises meta utiles et texte principal d'une page HTML. */
export function extractPage(html, baseUrl) {
  const blocks = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1].trim().replace(/^<!--|-->$/g, '');
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      try {
        blocks.push(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' ')));
      } catch {
        /* bloc illisible : ignoré */
      }
    }
  }
  const meta = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], 'property') || attr(m[0], 'name') || '').toLowerCase();
    const content = attr(m[0], 'content');
    if (!content) continue;
    if (key === 'og:title' && !meta.title) meta.title = content;
    if (key === 'og:site_name' && !meta.siteName) meta.siteName = content;
    if (key === 'og:image' && !meta.image) meta.image = content;
    if ((key === 'og:description' || key === 'description') && !meta.description) meta.description = content;
  }
  if (!meta.title) meta.title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || null;
  if (meta.image) {
    try {
      meta.image = new URL(meta.image, baseUrl).href;
    } catch {
      delete meta.image;
    }
  }
  // Texte principal : <main> ou <article> si présents, sans menus ni scripts.
  let body = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || html;
  body = body
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|button|select|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h\d|tr|section|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, MAX_TEXT);
  return { blocks, meta, text: body };
}

/** L'objet Recipe dans les blocs JSON-LD (avec @graph, tableaux…). */
export function findRecipe(blocks) {
  const stack = [].concat(blocks || []);
  while (stack.length) {
    const o = stack.shift();
    if (!o || typeof o !== 'object') continue;
    if (Array.isArray(o)) {
      stack.push(...o);
      continue;
    }
    const types = [].concat(o['@type'] || []).map((t) => String(t).toLowerCase());
    if (types.includes('recipe')) return o;
    if (o['@graph']) stack.push(o['@graph']);
    if (o.mainEntity) stack.push(o.mainEntity);
  }
  return null;
}

function imageUrlOf(recipe, meta, baseUrl) {
  const pick = (img) => (!img ? null : typeof img === 'string' ? img : Array.isArray(img) ? pick(img[0]) : img.url || img.contentUrl || null);
  const raw = pick(recipe?.image) || meta.image;
  try {
    return raw ? new URL(raw, baseUrl).href : null;
  } catch {
    return null;
  }
}

/** Télécharge une photo (pour l'import d'un fichier de recettes avec « imageUrl »). */
export async function fetchImage(url, { fetchFn = fetch } = {}) {
  const res = await fetchFn(url, { headers: { ...BROWSER_HEADERS, Accept: 'image/*' } });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || !/^image\/(jpeg|png|webp|gif|avif)/i.test(ct)) throw new Error('Photo introuvable');
  return `data:${ct.split(';')[0]};base64,${toBase64(await readLimited(res, MAX_IMAGE))}`;
}

async function readLimited(res, max) {
  const len = Number(res.headers.get('content-length') || 0);
  if (len > max) throw new Error('Page trop volumineuse');
  const buf = await res.arrayBuffer();
  if (buf.byteLength > max) throw new Error('Page trop volumineuse');
  return buf;
}

function toBase64(buf) {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Lit la page et prépare la réponse pour l'app. */
export async function fetchRecipePage(url, { fetchFn = fetch } = {}) {
  const res = await fetchFn(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
  if (!res.ok) {
    const e = new Error(`Le site a répondu ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const type = res.headers.get('content-type') || '';
  if (!/html|xml/i.test(type)) throw new Error('Ce lien n’est pas une page web');
  const html = new TextDecoder('utf-8').decode(await readLimited(res, MAX_HTML));
  const finalUrl = res.url || url;
  const { blocks, meta, text } = extractPage(html, finalUrl);
  const recipe = findRecipe(blocks);
  let imageData = null;
  const img = imageUrlOf(recipe, meta, finalUrl);
  if (img && checkTarget(img)) {
    try {
      const ir = await fetchFn(checkTarget(img), { headers: { ...BROWSER_HEADERS, Accept: 'image/*' } });
      const ct = ir.headers.get('content-type') || '';
      if (ir.ok && /^image\/(jpeg|png|webp|gif|avif)/i.test(ct)) {
        imageData = `data:${ct.split(';')[0]};base64,${toBase64(await readLimited(ir, MAX_IMAGE))}`;
      }
    } catch {
      /* photo facultative */
    }
  }
  return { url, finalUrl, recipe, meta, text: recipe ? '' : text, imageData };
}

// --- Point d'entrée ------------------------------------------------------------

export default {
  async fetch(request, env, ctx, deps = {}) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.some((re) => re.test(origin));
    if (request.method === 'OPTIONS') {
      return allowed ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
    }
    if (!allowed) return json({ error: 'Origine non autorisée' }, 403);
    if (request.method !== 'GET') return json({ error: 'Méthode non autorisée' }, 405, origin);
    const fetchFn = deps.fetchFn || fetch;
    try {
      await verifyFirebaseToken((request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), { fetchFn, now: deps.now });
    } catch (e) {
      return json({ error: `Connexion requise : ${e.message}` }, 401, origin);
    }
    const params = new URL(request.url).searchParams;
    if (params.has('ping')) return json({ ok: true, version: 2 }, 200, origin);
    if (params.has('image')) {
      const img = checkTarget(params.get('image'));
      if (!img) return json({ error: 'Adresse invalide' }, 400, origin);
      try {
        return json({ ok: true, imageData: await fetchImage(img, { fetchFn }) }, 200, origin);
      } catch (e) {
        return json({ error: e.message }, 502, origin);
      }
    }
    const target = checkTarget(params.get('url'));
    if (!target) return json({ error: 'Adresse invalide' }, 400, origin);
    try {
      return json({ ok: true, ...(await fetchRecipePage(target, { fetchFn })) }, 200, origin);
    } catch (e) {
      return json({ error: e.message, status: e.status || null }, 502, origin);
    }
  },
};
