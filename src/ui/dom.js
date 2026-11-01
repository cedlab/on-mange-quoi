// Mini-utilitaire de création d'éléments DOM (pas de framework).
// h('button', { class: 'btn', onclick: fn }, 'Texte', enfant…)
// Les chaînes sont insérées comme texte : pas de risque d'injection HTML.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [prop, val] of Object.entries(v)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, val);
          else el.style[prop] = val;
        }
      }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Élément SVG à partir d'une chaîne de confiance (icônes internes uniquement). */
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}

export function formatDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Remplace les enfants (accepte tableaux imbriqués, ignore null/false). */
export function setChildren(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* non disponible (iOS) */
  }
}
