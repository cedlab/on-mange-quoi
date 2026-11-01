// Configuration du projet Firebase. Ces valeurs ne sont pas secrètes : l'accès
// aux données est protégé par la connexion Google et les règles Firestore
// (firestore.rules), qui réservent tout aux membres de la famille.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCTVvjV0ydGvE0xQQnv8dUTpP4hEVThulA',
  authDomain: 'on-mange-quoi-a0c23.firebaseapp.com',
  projectId: 'on-mange-quoi-a0c23',
  storageBucket: 'on-mange-quoi-a0c23.firebasestorage.app',
  messagingSenderId: '130739216169',
  appId: '1:130739216169:web:742d8fac4fc6b3d2246138',
};

/**
 * Domaine de connexion. En ligne, les pages de connexion Firebase sont copiées
 * sur le même domaine que l'app (cedlab.github.io/on-mange-quoi/__/auth/, voir
 * .github/workflows/deploy.yml) : sinon Safari et Chrome sur iPhone, qui
 * cloisonnent les données entre domaines, perdent la connexion en cours
 * (« missing initial state »). En développement : domaine Firebase par défaut.
 */
export function authDomain() {
  if (typeof location !== 'undefined' && location.hostname === 'cedlab.github.io') {
    return `${location.host}${import.meta.env.BASE_URL}`.replace(/\/$/, '');
  }
  return FIREBASE_CONFIG.authDomain;
}

/** Adresse toujours autorisée (aussi inscrite dans firestore.rules). */
export const OWNER_EMAIL = 'cedric.carbonell@gmail.com';
