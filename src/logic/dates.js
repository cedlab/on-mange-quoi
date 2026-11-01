// Dates du planning : jours au format ISO local « 2026-11-07 », semaines du
// samedi au vendredi (comme le menu papier de la famille).

export const WEEK_START = 6; // 0 = dimanche … 6 = samedi

const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // midi : évite les surprises des changements d'heure
}

export function todayISO(now = new Date()) {
  return toISO(now);
}

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Premier jour (samedi) de la semaine qui contient ce jour. */
export function weekStart(iso, startDay = WEEK_START) {
  const d = fromISO(iso);
  const diff = (d.getDay() - startDay + 7) % 7;
  return addDays(iso, -diff);
}

export function weekDays(startIso) {
  return Array.from({ length: 7 }, (_, i) => addDays(startIso, i));
}

/** Tous les jours de from à to inclus (dans l'ordre, quel que soit le sens). */
export function daysBetween(from, to) {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const out = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Semaines (premiers jours) qui touchent la période. */
export function weeksBetween(from, to) {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const out = [];
  for (let w = weekStart(a); w <= b; w = addDays(w, 7)) out.push(w);
  return out;
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAY_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

export const dayName = (iso) => DAY_NAMES[fromISO(iso).getDay()];
export const dayShort = (iso) => DAY_SHORT[fromISO(iso).getDay()];
export const dayNumber = (iso) => fromISO(iso).getDate();
export const monthName = (m) => MONTHS[m];

/** « 05/09 » */
export function formatDDMM(iso) {
  const d = fromISO(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** « samedi 5 septembre » */
export function formatLong(iso) {
  const d = fromISO(iso);
  return `${DAY_NAMES[d.getDay()].toLowerCase()} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** « sam. 5 sept. » */
export function formatShort(iso) {
  const d = fromISO(iso);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/**
 * « du 5 au 11 septembre 2026 », « du 26 septembre au 2 octobre 2026 »,
 * « du 27 décembre 2025 au 2 janvier 2026 ».
 */
export function formatRange(from, to) {
  const a = fromISO(from);
  const b = fromISO(to);
  if (from === to) return `le ${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  if (a.getFullYear() !== b.getFullYear()) {
    return `du ${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()} au ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  }
  if (a.getMonth() !== b.getMonth()) {
    return `du ${a.getDate()} ${MONTHS[a.getMonth()]} au ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  }
  return `du ${a.getDate()} au ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

/** Grille d'un mois pour le calendrier (semaines commençant le lundi), null hors du mois. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(toISO(new Date(year, month, d, 12)));
  while (cells.length % 7) cells.push(null);
  return cells;
}
