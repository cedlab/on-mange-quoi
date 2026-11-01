// Composants d'interface réutilisables.
import { h } from './dom.js';
import { icon } from './icons.js';

// --- Notifications ------------------------------------------------------------

let toastTimer;
export function toast(message, { action, onAction, duration = 3500 } = {}) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', null, message),
    action && h('button', { class: 'toast-action', onclick: () => { el.remove(); onAction?.(); } }, action),
  );
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  if (duration) toastTimer = setTimeout(() => el.remove(), duration);
  return el;
}

// --- Feuilles modales (bottom sheets) ----------------------------------------

/** Ouvre une feuille modale. Retourne { el, close }. */
export function sheet(content, { title, onClose, className = '' } = {}) {
  const prevFocus = document.activeElement;
  const close = () => {
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 200);
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  const panel = h(
    'div',
    { class: `sheet ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' },
    h('div', { class: 'sheet-grip' }),
    title && h('div', { class: 'sheet-head' }, h('h2', null, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Fermer', onclick: () => close() }, icon('close'))),
    h('div', { class: 'sheet-body' }, content),
  );
  const backdrop = h('div', { class: 'backdrop', onclick: (e) => e.target === backdrop && close() }, panel);
  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => backdrop.classList.add('show'));
  return { el: panel, close };
}

export function confirmDialog(message, { ok = 'Confirmer', cancel = 'Annuler', danger = false, title } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => {
      if (answered) return;
      answered = true;
      s.close();
      resolve(v);
    };
    const s = sheet(
      h('div', { class: 'stack' },
        h('p', { class: 'confirm-msg' }, message),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn ghost grow', onclick: () => done(false) }, cancel),
          h('button', { class: `btn grow ${danger ? 'danger' : 'primary'}`, onclick: () => done(true) }, ok))),
      { title, onClose: () => done(false) },
    );
  });
}

/** Saisie d'un nombre décimal (« 1,5 », « 300 »). Résout null si annulé. */
export function promptDecimal({ title, value, suffix = '', hint, ok = 'Valider' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const input = h('input', {
      class: 'input num-input', type: 'text', inputmode: 'decimal', autocomplete: 'off',
      value: value !== undefined && value !== null ? String(value).replace('.', ',') : '', 'aria-label': title,
    });
    const done = (v) => {
      if (answered) return;
      answered = true;
      s.close();
      resolve(v);
    };
    const submit = (e) => {
      e?.preventDefault();
      const n = Number(input.value.replace(',', '.').replace(/[^0-9.]/g, ''));
      done(Number.isFinite(n) && n > 0 ? n : null);
    };
    const s = sheet(
      h('form', { class: 'stack', onsubmit: submit },
        hint && h('p', { class: 'muted' }, hint),
        h('div', { class: 'row gap center' }, input, suffix && h('span', { class: 'num-suffix' }, suffix)),
        h('button', { class: 'btn primary big', type: 'submit' }, ok)),
      { title, onClose: () => done(null) },
    );
    setTimeout(() => { input.focus(); input.select(); }, 80);
  });
}

/** Saisie d'un texte court. Résout null si annulé. */
export function promptText({ title, value = '', placeholder = '', hint, ok = 'Valider', type = 'text' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const input = h('input', { class: 'input', type, value, placeholder, autocomplete: 'off', 'aria-label': title });
    const done = (v) => {
      if (answered) return;
      answered = true;
      s.close();
      resolve(v);
    };
    const s = sheet(
      h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); done(input.value.trim()); } },
        hint && h('p', { class: 'muted' }, hint),
        input,
        h('button', { class: 'btn primary big', type: 'submit' }, ok)),
      { title, onClose: () => done(null) },
    );
    setTimeout(() => input.focus(), 80);
  });
}

// --- Petits contrôles ----------------------------------------------------------

/** Compteur − valeur + pour formulaires. L'élément expose `setValue(v)`. */
export function stepper({ value, min = 0, max = 99, step = 1, onchange, label, format = (v) => v }) {
  let v = value;
  const out = h('output', { class: 'stepper-value' }, format(v));
  const show = (nv) => {
    v = Math.min(max, Math.max(min, nv));
    out.textContent = format(v);
  };
  const set = (nv) => {
    show(nv);
    onchange?.(v);
  };
  const el = h('div', { class: 'stepper', role: 'group', 'aria-label': label },
    h('button', { type: 'button', class: 'step-btn', 'aria-label': `${label} : moins`, onclick: () => set(v - step) }, icon('minus', 20)),
    out,
    h('button', { type: 'button', class: 'step-btn', 'aria-label': `${label} : plus`, onclick: () => set(v + step) }, icon('plus', 20)));
  el.setValue = show;
  return el;
}

/** Contrôle segmenté. options : [{ value, label }] */
export function segmented(options, current, onchange, { className = '' } = {}) {
  const wrap = h('div', { class: `segmented ${className}`, role: 'radiogroup' });
  for (const o of options) {
    const b = h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(o.value === current),
      class: o.value === current ? 'on' : '',
      onclick: () => {
        wrap.querySelectorAll('button').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
        b.classList.add('on');
        b.setAttribute('aria-checked', 'true');
        onchange(o.value);
      },
    }, o.label);
    wrap.append(b);
  }
  return wrap;
}

export function emptyState(emoji, title, text, ...actions) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-emoji' }, emoji),
    h('h3', null, title),
    text && h('p', { class: 'muted' }, text),
    actions.length > 0 && h('div', { class: 'stack' }, actions));
}

export function header(title, { back, lead, actions = [] } = {}) {
  return h('header', { class: 'topbar' },
    back
      ? h('a', { class: 'icon-btn', href: back, 'aria-label': 'Retour' }, icon('back'))
      : h('span', { class: 'topbar-spacer' }, lead),
    h('h1', null, title),
    h('div', { class: 'topbar-actions' }, actions));
}
