// « Importer depuis un lien » : la recette d'une page web (Chronodrive,
// Marmiton…) récupérée par le relais Cloudflare, puis vérifiée dans le formulaire.
import { navigate, store } from '../../app.js';
import { draftFromPage } from '../../logic/jsonld.js';
import { normalizeUrl } from '../../logic/sources.js';
import { header, toast } from '../components.js';
import { h, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { processPhoto } from '../image.js';
import { setDraft } from './recipe-form.js';

const WORKER_CODE_URL = 'https://github.com/cedlab/on-mange-quoi/blob/main/worker/recipe-proxy.js';

/** Premier lien trouvé dans un texte partagé (« Regarde cette recette https://… »). */
export function findUrl(text) {
  return String(text || '').match(/https?:\/\/[^\s<>"']+/i)?.[0] || null;
}

async function callProxy(proxy, params) {
  const token = await store.getIdToken();
  if (!token) throw new Error('Connexion expirée : reconnecte-toi.');
  const u = new URL(proxy);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  let res;
  try {
    res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error('Le relais ne répond pas (pas de réseau, ou adresse du relais incorrecte).');
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* réponse vide */
  }
  if (!res.ok) {
    if (res.status === 403) throw new Error('Le relais refuse cette app : vérifie que son code est bien celui du dépôt (version à jour).');
    if (res.status === 401) throw new Error(`Le relais refuse la connexion : ${data.error || 'reconnecte-toi.'}`);
    if (res.status === 502 && [401, 403, 429, 503].includes(data.status)) {
      throw new Error('Le site refuse les accès automatiques. Pour cette recette, utilise plutôt « Coller un texte ».');
    }
    throw new Error(data.error || `Erreur ${res.status}`);
  }
  return data;
}

export function linkImportView(_, query = {}) {
  const proxy = store.settings.importProxy;
  const input = h('input', {
    class: 'input', type: 'url', inputmode: 'url', placeholder: 'https://www.chronodrive.com/…', autocomplete: 'off',
    value: findUrl(query.url || query.text) || '',
  });
  const status = h('div', { class: 'stack' });
  const btn = h('button', { class: 'btn primary big', type: 'submit' }, '✨ Importer la recette');

  async function run(e) {
    e?.preventDefault();
    const url = normalizeUrl(findUrl(input.value) || input.value);
    if (!url) {
      toast('Colle d’abord le lien de la recette.');
      return;
    }
    const existing = store.activeRecipes.find((r) => r.source?.url && normalizeUrl(r.source.url) === url);
    btn.disabled = true;
    setChildren(status, h('div', { class: 'card stack center' }, h('div', { class: 'spinner' }), h('p', { class: 'muted' }, 'Lecture de la recette…')));
    try {
      const page = await callProxy(proxy, { url });
      const draft = draftFromPage(page);
      if (!draft.ingredients.length && !draft.steps.length) {
        throw new Error('Aucune recette trouvée sur cette page. Essaie « Coller un texte ».');
      }
      if (page.imageData) {
        try {
          draft._photo = await processPhoto(page.imageData);
        } catch {
          /* photo facultative */
        }
      }
      setDraft(draft);
      if (existing) toast(`Attention : « ${existing.title} » vient déjà de ce lien.`, { duration: 6000 });
      navigate('/recette/nouvelle?brouillon=1');
    } catch (err) {
      setChildren(status, h('div', { class: 'card stack' },
        h('strong', null, 'Import impossible'),
        h('p', { class: 'small muted' }, err.message),
        h('a', { class: 'btn ghost', href: '#/recette/coller' }, '✨ Coller le texte à la place')));
    } finally {
      btn.disabled = false;
    }
  }

  const pasteBtn = navigator.clipboard?.readText && h('button', {
    class: 'btn ghost', type: 'button', onclick: async () => {
      try {
        const t = await navigator.clipboard.readText();
        const u = findUrl(t);
        if (u) input.value = u;
        else toast('Pas de lien dans le presse-papiers.');
      } catch {
        input.focus();
      }
    },
  }, icon('download', 18), 'Coller');

  const content = !proxy
    ? h('div', { class: 'card stack' },
      h('strong', null, 'Une petite installation d’abord'),
      h('p', { class: 'small' }, 'Pour lire une page de recette, l’app a besoin d’un petit relais gratuit chez Cloudflare (5 minutes, une seule fois pour toute la famille).'),
      h('a', { class: 'btn primary', href: '#/import-lien' }, 'Installer le relais'),
      h('a', { class: 'btn ghost', href: '#/recette/coller' }, 'En attendant : coller le texte'))
    : h('form', { class: 'stack', onsubmit: run, novalidate: true },
      h('div', { class: 'card stack' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Lien de la recette'), input),
        h('div', { class: 'row gap' }, pasteBtn, h('span', { class: 'grow' })),
        btn),
      status,
      h('p', { class: 'small muted pad-x' },
        'Chronodrive : Partager → Copier le lien. Fonctionne aussi avec Marmiton, 750g, CuisineAZ et la plupart des sites de recettes. Pas avec Cookidoo (connexion obligatoire) : pour Cookidoo, utilise « Coller un texte ».'));

  // Lien reçu par le partage (Android) : import direct.
  if (proxy && findUrl(query.url || query.text) && query.auto !== '0') setTimeout(() => run(), 50);

  return h('div', { class: 'page' }, header('Importer depuis un lien', { back: '#/' }), h('div', { class: 'stack' }, content));
}

/** Plus → Import par lien : installation et test du relais. */
export function proxySettingsView() {
  const input = h('input', {
    class: 'input', type: 'url', inputmode: 'url', placeholder: 'https://omq-recettes.xxx.workers.dev',
    value: store.settings.importProxy || '', autocomplete: 'off',
  });
  const result = h('div');
  const copyBtn = h('button', {
    class: 'btn ghost', type: 'button', onclick: async () => {
      try {
        const { default: code } = await import('../../../worker/recipe-proxy.js?raw');
        await navigator.clipboard.writeText(code);
        toast('Code du relais copié : colle-le dans Cloudflare.');
      } catch {
        window.open(WORKER_CODE_URL, '_blank', 'noopener');
      }
    },
  }, icon('download', 18), 'Copier le code du relais');

  async function saveAndTest(e) {
    e.preventDefault();
    const url = normalizeUrl(input.value);
    if (!url) {
      toast('Adresse invalide.');
      return;
    }
    setChildren(result, h('div', { class: 'spinner' }));
    try {
      const data = await callProxy(url, { ping: '1' });
      if (!data.ok) throw new Error('Réponse inattendue');
      await store.saveSettings({ importProxy: url.replace(/\/$/, '') });
      setChildren(result, h('p', { class: 'notice-ok' }, '✅ Le relais fonctionne. L’import par lien est prêt pour toute la famille.'));
    } catch (err) {
      setChildren(result, h('p', { class: 'small error-text' }, `❌ ${err.message}`));
    }
  }

  return h('div', { class: 'page' }, header('Import par lien', { back: '#/plus' }),
    h('div', { class: 'stack' },
      h('div', { class: 'card stack' },
        h('h2', null, 'Installer le relais (une seule fois)'),
        h('ol', { class: 'help-list small' },
          h('li', null, 'Sur un ordinateur, crée un compte gratuit sur ', h('a', { href: 'https://dash.cloudflare.com/sign-up', target: '_blank', rel: 'noopener' }, 'dash.cloudflare.com'), '.'),
          h('li', null, 'Menu ', h('strong', null, 'Workers & Pages'), ' (ou « Compute ») → ', h('strong', null, 'Créer'), ' → ', h('strong', null, 'Créer un Worker'), ' (modèle « Hello World »). Nomme-le ', h('code', null, 'omq-recettes'), ', puis ', h('strong', null, 'Déployer'), '.'),
          h('li', null, h('strong', null, 'Modifier le code'), ' : efface tout et colle le code du relais (bouton ci-dessous, ou ', h('a', { href: WORKER_CODE_URL, target: '_blank', rel: 'noopener' }, 'sur GitHub'), '), puis ', h('strong', null, 'Déployer'), '.'),
          h('li', null, 'Copie l’adresse du Worker (', h('code', null, 'https://omq-recettes.….workers.dev'), ') et colle-la ci-dessous.')),
        copyBtn,
        h('p', { class: 'small muted' }, 'Gratuit (100 000 requêtes par jour). Le relais n’accepte que les membres connectés à l’app et ne conserve rien.')),
      h('form', { class: 'card stack', onsubmit: saveAndTest, novalidate: true },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Adresse du relais'), input),
        h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer et tester'),
        result)));
}
