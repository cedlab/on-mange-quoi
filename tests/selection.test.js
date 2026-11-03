import { describe, expect, it } from 'vitest';
import { ago } from '../src/ui/views/selection.js';

describe('ago', () => {
  const now = new Date(2026, 10, 3, 20, 0).getTime();
  const at = (d, h = 12) => new Date(2026, 10, d, h).getTime();
  it('écrit la date d’ajout simplement', () => {
    expect(ago(at(3, 1), now)).toBe('aujourd’hui');
    expect(ago(at(2, 23), now)).toBe('hier');
    expect(ago(new Date(2026, 9, 30).getTime(), now)).toBe('il y a 4 jours');
    expect(ago(new Date(2026, 9, 13).getTime(), now)).toBe('il y a 3 semaines');
    expect(ago(new Date(2026, 6, 1).getTime(), now)).toBe('il y a 4 mois');
    expect(ago(null, now)).toBe('');
  });
});
