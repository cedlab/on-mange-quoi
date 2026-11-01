// Accès à Firebase : connexion Google + Firestore (cache local persistant,
// donc l'app fonctionne hors ligne et se synchronise au retour du réseau).
//
// Collections :
//   recipes/{id}       recette (+ vignette « thumb » de quelques Ko)
//   recipePhotos/{id}  photo de la recette (chargée à la demande)
//   config/access      { members: [adresses autorisées] }
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, getAuth, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut,
} from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDoc, initializeFirestore, onSnapshot, persistentLocalCache,
  persistentMultipleTabManager, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { FIREBASE_CONFIG } from '../firebase.js';

const BATCH_OPS = 400; // limite Firestore : 500 écritures par lot
const BATCH_BYTES = 4_000_000; // et 10 Mo par requête : on reste large

export function createFirebaseBackend() {
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = getAuth(app);
  auth.languageCode = 'fr';
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  const recipesCol = collection(db, 'recipes');
  let user = null;

  const stamp = () => ({ updatedAt: Date.now(), updatedBy: user?.email || null });

  return {
    kind: 'firebase',

    // --- Connexion -------------------------------------------------------------
    onUser(cb) {
      getRedirectResult(auth).catch((e) => console.warn('Retour de connexion', e));
      return onAuthStateChanged(auth, (u) => {
        user = u ? { uid: u.uid, email: (u.email || '').toLowerCase(), name: u.displayName || '', photo: u.photoURL || '' } : null;
        cb(user);
      });
    },
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        // Fenêtre bloquée ou non disponible (certaines apps installées) : redirection.
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw e;
      }
    },
    signOut: () => signOut(auth),

    // --- Membres ---------------------------------------------------------------
    async getMembers() {
      const snap = await getDoc(doc(db, 'config', 'access'));
      return snap.exists() ? snap.data().members || [] : null;
    },
    async setMembers(members) {
      await setDoc(doc(db, 'config', 'access'), { members, ...stamp() });
    },

    // --- Recettes --------------------------------------------------------------
    watchRecipes(onChange, onError) {
      return onSnapshot(recipesCol, (snap) => {
        onChange(snap.docs.map((d) => ({ ...d.data(), id: d.id })), { fromCache: snap.metadata.fromCache });
      }, onError);
    },
    async addRecipe(data) {
      const ref = doc(recipesCol);
      await setDoc(ref, { ...data, createdAt: Date.now(), createdBy: user?.email || null, ...stamp() });
      return ref.id;
    },
    newRecipeId: () => doc(recipesCol).id,
    async setRecipe(id, data) {
      await setDoc(doc(recipesCol, id), { ...data, ...stamp() });
    },
    async updateRecipe(id, patch) {
      await updateDoc(doc(recipesCol, id), { ...patch, ...stamp() });
    },
    async removeRecipe(id) {
      const batch = writeBatch(db);
      batch.delete(doc(recipesCol, id));
      batch.delete(doc(db, 'recipePhotos', id));
      await batch.commit();
    },
    async getPhoto(id) {
      const snap = await getDoc(doc(db, 'recipePhotos', id));
      return snap.exists() ? snap.data().data : null;
    },
    async setPhoto(id, dataUrl) {
      if (dataUrl) await setDoc(doc(db, 'recipePhotos', id), { data: dataUrl, ...stamp() });
      else await deleteDoc(doc(db, 'recipePhotos', id));
    },

    /** Import en lots : items [{ recipe, photo }] ; onProgress(n écrits). */
    async importRecipes(items, onProgress) {
      let batch = writeBatch(db);
      let ops = 0;
      let bytes = 0;
      let done = 0;
      let pending = 0;
      const now = Date.now();
      const flush = async () => {
        if (!ops) return;
        await batch.commit();
        done += pending;
        onProgress?.(done);
        batch = writeBatch(db);
        ops = 0;
        bytes = 0;
        pending = 0;
      };
      for (const { recipe, photo } of items) {
        const size = JSON.stringify(recipe).length + (photo?.length || 0);
        if (ops + 2 > BATCH_OPS || bytes + size > BATCH_BYTES) await flush();
        const ref = doc(recipesCol);
        batch.set(ref, { ...recipe, createdAt: now, createdBy: user?.email || null, ...stamp() });
        ops += 1;
        if (photo) {
          batch.set(doc(db, 'recipePhotos', ref.id), { data: photo, ...stamp() });
          ops += 1;
        }
        bytes += size;
        pending += 1;
      }
      await flush();
    },
  };
}
