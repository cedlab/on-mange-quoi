import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryBackend } from '../src/data/memory-backend.js';
import { Store } from '../src/data/store.js';
import { OWNER_EMAIL } from '../src/firebase.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
});

async function signedIn(email, members) {
  const store = new Store(createMemoryBackend({ email, members })).start();
  await tick();
  await store.signIn();
  await tick();
  await tick();
  return store;
}

describe('accès', () => {
  it('laisse entrer un membre et charge les recettes', async () => {
    const store = await signedIn('maman@exemple.fr', ['maman@exemple.fr']);
    expect(store.status).toBe('ready');
    expect(store.loaded).toBe(true);
  });
  it('refuse une adresse qui n’est pas dans la liste', async () => {
    const store = await signedIn('inconnu@exemple.fr', ['maman@exemple.fr']);
    expect(store.status).toBe('denied');
  });
  it('le propriétaire est toujours accepté', async () => {
    const backend = createMemoryBackend({ email: OWNER_EMAIL, members: [OWNER_EMAIL] });
    const store = new Store(backend).start();
    await tick();
    await store.signIn();
    await tick();
    expect(store.status).toBe('ready');
  });
});

describe('recettes', () => {
  it('enregistre, note, met à la corbeille et restaure', async () => {
    const store = await signedIn('a@b.fr', ['a@b.fr']);
    const listener = vi.fn();
    store.subscribe(listener);
    await expect(store.saveRecipe(null, { title: 'Sans source' })).rejects.toThrow(/source/);
    const id = await store.saveRecipe(null, {
      title: 'Crêpes', servings: '4', source: { type: 'perso', title: 'Mamie' },
      ingredients: [{ name: 'farine', qty: 250, unit: 'g' }],
    }, { photo: 'data:image/jpeg;base64,P', thumb: 'data:image/jpeg;base64,T' });
    await tick();
    expect(store.recipe(id)).toMatchObject({ title: 'Crêpes', servings: 4, thumb: 'data:image/jpeg;base64,T', createdBy: 'a@b.fr' });
    expect(await store.getPhoto(id)).toBe('data:image/jpeg;base64,P');
    await store.setRating(id, 5);
    await tick();
    expect(store.recipe(id).rating).toBe(5);
    // Modifier sans toucher à la photo garde la vignette.
    await store.saveRecipe(id, { ...store.recipe(id), title: 'Crêpes de Mamie' });
    await tick();
    expect(store.recipe(id)).toMatchObject({ title: 'Crêpes de Mamie', thumb: 'data:image/jpeg;base64,T', rating: 5 });
    await store.trash(id);
    await tick();
    expect(store.activeRecipes).toHaveLength(0);
    expect(store.trashedRecipes).toHaveLength(1);
    await store.restore(id);
    await tick();
    expect(store.activeRecipes).toHaveLength(1);
    await store.purge(id);
    await tick();
    expect(store.recipes).toHaveLength(0);
    expect(await store.getPhoto(id)).toBe(null);
    expect(listener).toHaveBeenCalledWith('recipes');
  });
});
