import { describe, expect, it } from 'vitest';
import { validateProfile, validatePasswordChange } from '@/lib/application/portal/account';
describe('account validation', () => {
  it('accepts international contact information', () => {
    expect(validateProfile({ displayName: 'Uyên Phạm', nationality: 'VN', phone: '+84 912 345 678' })).toBeNull();
  });
  it('rejects empty names and malformed international phone numbers', () => {
    expect(validateProfile({ displayName: ' ', nationality: '', phone: '' })).toBe('name');
    expect(validateProfile({ displayName: 'User', nationality: 'VN', phone: 'abc' })).toBe('phone');
  });
  it('requires current password, a strong different password and exact confirmation', () => {
    expect(validatePasswordChange('', 'NewPass123', 'NewPass123')).toBe('current');
    expect(validatePasswordChange('OldPass123', 'password', 'password')).toBe('weak');
    expect(validatePasswordChange('OldPass123', 'NewPass123', 'NewPass124')).toBe('confirmation');
    expect(validatePasswordChange('OldPass123', 'OldPass123', 'OldPass123')).toBe('same');
    expect(validatePasswordChange('OldPass123', 'NewPass123', 'NewPass123')).toBeNull();
  });
});
