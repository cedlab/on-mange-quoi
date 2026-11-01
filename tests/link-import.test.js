import { beforeEach, describe, expect, it } from 'vitest';
import worker, { checkTarget, extractPage, fetchRecipePage, findRecipe, resetKeyCache, verifyFirebaseToken } from '../worker/recipe-proxy.js';
import { cleanText, decodeEntities, draftFromPage, isoMinutes } from '../src/logic/jsonld.js';

// --- Jeton de test signé avec une clé générée -----------------------------------
const b64url = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let keyPair;
let jwk;
async function makeToken(payload, kid = 'k1') {
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ alg: 'RS256', kid, typ: 'JWT' });
  const body = enc(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}
const NOW = Date.UTC(2026, 10, 1, 12);
const goodPayload = () => ({
  aud: 'on-mange-quoi-a0c23', iss: 'https://securetoken.google.com/on-mange-quoi-a0c23', sub: 'u1',
  iat: NOW / 1000 - 60, exp: NOW / 1000 + 3000, email: 'a@b.fr',
});

const PAGE = `<!doctype html><html><head><title>Quiche – Chronodrive</title>
<meta property="og:site_name" content="Chronodrive"><meta property="og:image" content="/img/quiche.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":["Recipe"],
"name":"Quiche lorraine &amp; salade","recipeYield":"6 personnes","prepTime":"PT20M","cookTime":"PT35M","totalTime":"PT1H10M",
"recipeCategory":"Plat principal","image":{"@type":"ImageObject","url":"https://www.chronodrive.com/img/quiche.jpg"},
"recipeIngredient":["1 pâte brisée","200 g de lardons","3 &oelig;ufs","20 cl de crème fraîche"],
"recipeInstructions":[{"@type":"HowToSection","name":"La garniture","itemListElement":[{"@type":"HowToStep","text":"Battre les œufs et la crème."},{"@type":"HowToStep","text":"Ajouter les lardons."}]},{"@type":"HowToStep","text":"<p>Cuire 35 min à 180&deg;C.</p>"}]}]}</script>
</head><body><nav>Menu</nav><main><h1>Quiche</h1><p>Ajouter au panier</p></main></body></html>`;

function fakeFetch(routes) {
  return async (url) => {
    const r = routes[String(url)];
    if (!r) return new Response('introuvable', { status: 404 });
    return r();
  };
}

beforeEach(async () => {
  resetKeyCache();
  if (!keyPair) {
    keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    jwk = { ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'k1', alg: 'RS256' };
  }
});

const JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const jwksRoute = () => Response.json({ keys: [jwk] });

describe('relais : sécurité', () => {
  it('accepte un jeton valide du projet et refuse les autres', async () => {
    const fetchFn = fakeFetch({ [JWKS]: jwksRoute });
    await expect(verifyFirebaseToken(await makeToken(goodPayload()), { fetchFn, now: NOW })).resolves.toMatchObject({ sub: 'u1' });
    await expect(verifyFirebaseToken(await makeToken({ ...goodPayload(), aud: 'autre' }), { fetchFn, now: NOW })).rejects.toThrow(/autre projet/);
    await expect(verifyFirebaseToken(await makeToken({ ...goodPayload(), exp: NOW / 1000 - 1 }), { fetchFn, now: NOW })).rejects.toThrow(/expiré/);
    await expect(verifyFirebaseToken(await makeToken(goodPayload(), 'inconnue'), { fetchFn, now: NOW })).rejects.toThrow(/Clé inconnue/);
    const t = await makeToken(goodPayload());
    await expect(verifyFirebaseToken(`${t.slice(0, -4)}AAAA`, { fetchFn, now: NOW })).rejects.toThrow(/Signature/);
    await expect(verifyFirebaseToken('', { fetchFn, now: NOW })).rejects.toThrow(/mal formé/);
  });
  it('refuse les adresses locales ou non web', () => {
    expect(checkTarget('https://www.chronodrive.com/recette/x')).toBe('https://www.chronodrive.com/recette/x');
    expect(checkTarget('http://marmiton.org/a')).toBe('https://marmiton.org/a');
    for (const bad of ['', 'ftp://x.fr/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://10.0.0.1/', 'https://intranet/a', 'https://[::1]/']) {
      expect(checkTarget(bad)).toBe(null);
    }
  });
  it('point d’entrée : origine, jeton, adresse', async () => {
    const token = await makeToken(goodPayload());
    const deps = { fetchFn: fakeFetch({ [JWKS]: jwksRoute }), now: NOW };
    const req = (url, headers = {}) => new Request(url, { headers: { Origin: 'https://cedlab.github.io', Authorization: `Bearer ${token}`, ...headers } });
    expect((await worker.fetch(req('https://w.dev/?ping=1', { Origin: 'https://pirate.fr' }), {}, {}, deps)).status).toBe(403);
    const pre = await worker.fetch(new Request('https://w.dev/', { method: 'OPTIONS', headers: { Origin: 'https://cedlab.github.io' } }), {}, {}, deps);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('https://cedlab.github.io');
    expect((await worker.fetch(req('https://w.dev/?ping=1', { Authorization: '' }), {}, {}, deps)).status).toBe(401);
    expect(await (await worker.fetch(req('https://w.dev/?ping=1'), {}, {}, deps)).json()).toEqual({ ok: true, version: 2 });
    expect((await worker.fetch(req('https://w.dev/?url=https://127.0.0.1/'), {}, {}, deps)).status).toBe(400);
  });
});

describe('relais : lecture de la page', () => {
  it('extrait la recette, les métadonnées et la photo', async () => {
    const fetchFn = fakeFetch({
      'https://www.chronodrive.com/recette/quiche': () => new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      'https://www.chronodrive.com/img/quiche.jpg': () => new Response(new Uint8Array([255, 216, 255]), { headers: { 'content-type': 'image/jpeg' } }),
    });
    const page = await fetchRecipePage('https://www.chronodrive.com/recette/quiche', { fetchFn });
    expect(page.recipe.name).toBe('Quiche lorraine &amp; salade');
    expect(page.meta).toMatchObject({ siteName: 'Chronodrive', image: 'https://www.chronodrive.com/img/quiche.jpg' });
    expect(page.imageData).toBe('data:image/jpeg;base64,/9j/');
    expect(page.text).toBe('');
  });
  it('sans données structurées : texte principal sans menus', () => {
    const { blocks, text, meta } = extractPage('<html><head><title>Ma recette</title></head><body><nav>Accueil</nav><article><h1>Crêpes</h1><ul><li>250 g de farine</li><li>3 œufs</li></ul><script>x()</script></article><footer>©</footer></body></html>', 'https://site.fr/');
    expect(blocks).toEqual([]);
    expect(meta.title).toBe('Ma recette');
    expect(text).toBe('Crêpes\n250 g de farine\n3 œufs');
    expect(findRecipe([{ '@type': 'Organization' }, [{ mainEntity: { '@type': 'Recipe', name: 'X' } }]])).toEqual({ '@type': 'Recipe', name: 'X' });
  });
  it('signale une page refusée par le site', async () => {
    const fetchFn = async () => new Response('non', { status: 403 });
    await expect(fetchRecipePage('https://www.chronodrive.com/x', { fetchFn })).rejects.toMatchObject({ status: 403 });
  });
});

describe('app : brouillon depuis la page', () => {
  it('utilitaires', () => {
    expect(decodeEntities('Cr&egrave;me &amp; caf&#233; &#x2019;')).toBe('Crème & café ’');
    expect(cleanText('<p>Un</p><p>Deux&nbsp;!</p>')).toBe('Un\nDeux !');
    expect(isoMinutes('PT1H30M')).toBe(90);
    expect(isoMinutes('P0DT45M')).toBe(45);
    expect(isoMinutes('PT0S')).toBe(null);
    expect(isoMinutes('n’importe quoi')).toBe(null);
  });
  it('convertit une recette schema.org', async () => {
    const fetchFn = fakeFetch({ 'https://www.chronodrive.com/recette/quiche': () => new Response(PAGE, { headers: { 'content-type': 'text/html' } }) });
    const page = await fetchRecipePage('https://www.chronodrive.com/recette/quiche', { fetchFn });
    const d = draftFromPage(page);
    expect(d).toMatchObject({
      title: 'Quiche lorraine & salade', servings: 6, prepMin: 20, cookMin: 35, restMin: 15, category: 'plat',
      source: { type: 'chronodrive', title: 'Chronodrive', url: 'https://www.chronodrive.com/recette/quiche' },
      imageUrl: 'https://www.chronodrive.com/img/quiche.jpg',
    });
    expect(d.ingredients.map((i) => [i.qty, i.unit, i.name])).toEqual([
      [1, undefined, 'pâte brisée'], [200, 'g', 'lardons'], [3, undefined, 'œufs'], [20, 'cl', 'crème fraîche'],
    ]);
    expect(d.steps).toEqual([
      { section: 'La garniture' }, { text: 'Battre les œufs et la crème.' }, { text: 'Ajouter les lardons.' }, { text: 'Cuire 35 min à 180°C.' },
    ]);
  });
  it('sans données structurées : analyse du texte', () => {
    const d = draftFromPage({ url: 'https://blog.fr/crepes', meta: { title: 'Crêpes de Mamie' }, text: 'Ingrédients\n250 g de farine\n3 œufs\nPréparation\nMélanger le tout.' });
    expect(d.title).toBe('Crêpes de Mamie');
    expect(d.ingredients.map((i) => i.name)).toEqual(['farine', 'œufs']);
    expect(d.source).toEqual({ type: 'web', title: 'blog.fr', url: 'https://blog.fr/crepes' });
    expect(d.fromText).toBe(true);
  });
});
