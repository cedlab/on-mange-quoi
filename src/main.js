import './styles.css';
import { route, setGateView, setStore, startRouter } from './app.js';
import { Store } from './data/store.js';
import { registerServiceWorker } from './pwa.js';
import { initTheme } from './theme.js';
import { gateView } from './ui/views/login.js';
import { recipesView } from './ui/views/recipes.js';
import { recipeView } from './ui/views/recipe.js';
import { recipeFormView } from './ui/views/recipe-form.js';
import { importView } from './ui/views/import.js';
import { comingSoonView, membersView, moreView, sortView, trashView } from './ui/views/more.js';

initTheme();
registerServiceWorker();

route('/', recipesView, { tab: 'recipes' });
route('/recette/nouvelle', () => recipeFormView({}), { tab: 'recipes' });
route('/recette/:id/modifier', recipeFormView, { tab: 'recipes' });
route('/recette/:id', recipeView, { tab: 'recipes', live: true });
route('/importer', importView, { tab: 'more' });
route('/classer', sortView, { tab: 'more' });
route('/plus', moreView, { tab: 'more', live: true });
route('/membres', membersView, { tab: 'more' });
route('/corbeille', trashView, { tab: 'more', live: true });
route('/semaine', comingSoonView('Semaine', '📅', 'Le planning des repas (midi, soir et Poupette) et le menu à imprimer.', 2), { tab: 'week' });
route('/courses', comingSoonView('Courses', '🛒', 'La liste de courses générée depuis le planning, rangée par rayon.', 2), { tab: 'shopping' });
route('/placards', comingSoonView('Placards', '🧺', 'Ce que tu as à la maison, et des idées de recettes avec.', 3), { tab: 'pantry' });

function isDemo() {
  try {
    if (/[?&]demo=1/.test(location.hash + location.search)) sessionStorage.setItem('omq.demo', '1');
    return sessionStorage.getItem('omq.demo') === '1';
  } catch {
    return false;
  }
}

async function createBackend() {
  // Mode démo (développement uniquement) : données en mémoire, sans Firebase.
  if (import.meta.env.DEV && isDemo()) {
    const { createMemoryBackend } = await import('./data/memory-backend.js');
    return createMemoryBackend();
  }
  const { createFirebaseBackend } = await import('./data/firestore-backend.js');
  return createFirebaseBackend();
}

createBackend().then((backend) => {
  const store = new Store(backend);
  setStore(store);
  setGateView(gateView);
  startRouter();
  store.start();
});
