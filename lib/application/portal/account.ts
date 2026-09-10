export interface AccountProfile { displayName: string; nationality: string; phone: string }
export function validateProfile(p: AccountProfile) {
  if (!p.displayName.trim() || p.displayName.trim().length > 80 || /[\u0000-\u001f]/.test(p.displayName)) return 'name';
  if (p.nationality && !/^[A-Z]{2}$/.test(p.nationality)) return 'nationality';
  if (p.phone && !/^\+[1-9][0-9]{6,14}$/.test(p.phone.replace(/[\s()-]/g, ''))) return 'phone';
  return null;
}
export function validatePasswordChange(current: string, password: string, confirmation: string) {
  if (!current) return 'current';
  if (password === current) return 'same';
  if (password.length < 8 || password.length > 128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) return 'weak';
  if (password !== confirmation) return 'confirmation';
  return null;
}
