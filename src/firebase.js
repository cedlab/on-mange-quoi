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

/** Adresse toujours autorisée (aussi inscrite dans firestore.rules). */
export const OWNER_EMAIL = 'cedric.carbonell@gmail.com';
