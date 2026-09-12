import { describe, expect, it } from 'vitest';
import { validateGuideField, normalizeGuidePhone } from '@/lib/application/portal/guide-profile';

describe('guide profile rules', () => {
  it('normalizes international phone and rejects local numbers', () => {
    expect(normalizeGuidePhone('+84 912-345-678')).toBe('+84912345678');
    expect(validateGuideField('phone', '0912345678')).toBe('phone');
    expect(validateGuideField('phone', '+84912345678')).toBeNull();
  });
  it('requires 100–1000 biography characters', () => {
    expect(validateGuideField('bio', 'a'.repeat(99))).toBe('bio');
    expect(validateGuideField('bio', 'a'.repeat(100))).toBeNull();
    expect(validateGuideField('bio', 'a'.repeat(1001))).toBe('bio');
  });
  it('requires a contact address within 300 characters', () => {
    expect(validateGuideField('contactAddress', ' ')).toBe('contactAddress');
    expect(validateGuideField('contactAddress', 'TP. Hồ Chí Minh')).toBeNull();
    expect(validateGuideField('contactAddress', 'a'.repeat(301))).toBe('contactAddress');
  });
});
