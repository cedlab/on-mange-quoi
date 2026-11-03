// Écrans d'accès : chargement, connexion Google, accès refusé, erreur.
import { h } from '../dom.js';
import { toast } from '../components.js';

const AUTH_ERRORS = {
  'auth/popup-closed-by-user': 'Connexion annulée.',
  'auth/network-request-failed': 'Pas de connexion internet.',
  'auth/unauthorized-domain': "Ce site n'est pas autorisé dans Firebase (Authentication → Paramètres → Domaines autorisés).",
  'auth/operation-not-allowed': "La connexion Google n'est pas activée dans Firebase.",
  'auth/redirect-cancelled-by-user': 'Connexion annulée.',
  'auth/web-storage-unsupported': 'Ce navigateur bloque le stockage (navigation privée ?). Essaie dans Safari ou Chrome en mode normal.',
};

function brand(subtitle) {
  return h('div', { class: 'brand' },
    h('img', { class: 'brand-icon', src: `${import.meta.env.BASE_URL}icons/icon-192.png`, alt: '' }),
    h('h1', null, 'On mange quoi ?'),
    subtitle && h('p', { class: 'muted' }, subtitle));
}

export function gateView(store) {
  const { status, user } = store;
  if (status === 'loading' || status === 'checking') {
    return h('div', { class: 'gate' }, brand(status === 'checking' ? 'Vérification de l’accès…' : ''), h('div', { class: 'spinner' }));
  }
  if (status === 'denied') {
    return h('div', { class: 'gate' },
      brand(),
      h('div', { class: 'card stack' },
        h('h2', null, 'Accès réservé à la famille'),
        h('p', null, 'Le compte ', h('strong', null, user?.email || '?'), " n'est pas (encore) dans la liste des membres."),
        h('p', { class: 'muted' }, 'Demande à un membre de t’ajouter : Plus → Membres de la famille.'),
        h('button', { class: 'btn ghost', onclick: () => store.signOut() }, 'Utiliser un autre compte')));
  }
  if (status === 'error') {
    return h('div', { class: 'gate' },
      brand(),
      h('div', { class: 'card stack' },
        h('h2', null, 'Connexion impossible'),
        h('p', { class: 'muted' }, store.error?.message || 'Erreur inconnue.'),
        h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Réessayer'),
        h('button', { class: 'btn ghost', onclick: () => store.signOut() }, 'Se déconnecter')));
  }
  // Déconnecté
  const btn = h('button', {
    class: 'btn primary big google-btn',
    onclick: async () => {
      btn.disabled = true;
      try {
        await store.signIn();
      } catch (e) {
        console.error(e);
        toast(AUTH_ERRORS[e.code] || `Connexion impossible (${e.code || e.message}).`, { duration: 6000 });
      } finally {
        btn.disabled = false;
      }
    },
  }, h('span', { class: 'g-logo', 'aria-hidden': 'true' }, 'G'), 'Se connecter avec Google');
  const err = store.authError;
  return h('div', { class: 'gate' },
    brand('Les recettes et les menus de la semaine de la famille.'),
    err && h('div', { class: 'card stack' },
      h('strong', null, 'La connexion n’a pas abouti'),
      h('p', { class: 'small muted' }, AUTH_ERRORS[err.code] || `${err.code || ''} ${err.message || ''}`.trim())),
    btn,
    h('p', { class: 'small muted center-text' }, 'Application privée : seuls les membres de la famille y ont accès.'));
}
