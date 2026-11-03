// Dictée vocale (reconnaissance de la parole du navigateur : Chrome sur
// Android, Safari sur iPhone). Le bouton 🎤 remplit le champ avec ce qui est dit.
import { toast } from './components.js';
import { h } from './dom.js';
import { icon } from './icons.js';

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export const voiceSupported = () => Boolean(Recognition);

const ERRORS = {
  'not-allowed': 'Autorise l’accès au micro pour dicter (réglages du navigateur).',
  'service-not-allowed': 'La dictée n’est pas disponible ici : utilise le micro du clavier.',
  'no-speech': 'Je n’ai rien entendu, réessaie.',
  'audio-capture': 'Micro introuvable.',
  network: 'La dictée a besoin d’internet.',
};

/**
 * Bouton micro pour un champ texte. onFinal(texte) est appelé quand la
 * phrase est terminée. Renvoie null si le navigateur ne sait pas dicter
 * (le micro du clavier du téléphone reste alors utilisable).
 */
export function micButton(input, { onFinal } = {}) {
  if (!Recognition) return null;
  let rec = null;
  let finalText = '';
  const btn = h('button', { type: 'button', class: 'mic-btn', 'aria-label': 'Dicter', title: 'Dicter' }, icon('mic', 22));
  const stop = () => rec?.stop();
  btn.addEventListener('click', () => {
    if (rec) {
      stop();
      return;
    }
    rec = new Recognition();
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    const before = input.value.trim();
    finalText = '';
    rec.onresult = (e) => {
      let said = '';
      for (const r of e.results) said += r[0].transcript;
      said = said.trim();
      if (!before) said = said.charAt(0).toUpperCase() + said.slice(1);
      input.value = before ? `${before} ${said}` : said;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (e.results[e.results.length - 1].isFinal) finalText = input.value.trim();
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted') toast(ERRORS[e.error] || 'La dictée n’a pas marché, réessaie.');
    };
    rec.onend = () => {
      rec = null;
      btn.classList.remove('listening');
      btn.setAttribute('aria-label', 'Dicter');
      if (finalText) onFinal?.(finalText);
    };
    try {
      rec.start();
      btn.classList.add('listening');
      btn.setAttribute('aria-label', 'Arrêter la dictée');
    } catch {
      rec = null;
      toast('La dictée n’est pas disponible ici : utilise le micro du clavier.');
    }
  });
  return btn;
}
