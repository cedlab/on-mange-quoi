// Historique de l'app : chaque page visitée reçoit un numéro (history.state.i),
// pour savoir si « Retour » peut revenir à la page d'avant dans l'app.
let last = -1;

/** À appeler à chaque affichage de page. */
export function trackHistory() {
  const st = history.state || {};
  if (typeof st.i !== 'number') history.replaceState({ ...st, i: last + 1 }, '');
  last = history.state.i;
}

/** Vrai s'il y a une page précédente dans l'app (pas l'ouverture de l'app). */
export const canGoBack = () => (history.state?.i || 0) > 0;
