export type GuideField = 'phone' | 'contactAddress' | 'bio';
export interface GuidePersonalProfile {
  displayName: string; email: string; phone: string; contactAddress: string; bio: string;
  language: string; operatingArea: string; joinedAt: string;
}
export interface GuideProfilePort {
  load(): Promise<GuidePersonalProfile>;
  save(field: GuideField, value: string): Promise<GuidePersonalProfile>;
}
export const normalizeGuidePhone = (value: string) => value.replace(/[\s()-]/g, '');
export function validateGuideField(field: GuideField, value: string): GuideField | null {
  const clean = value.trim();
  if (field === 'phone') return /^\+[1-9][0-9]{6,14}$/.test(normalizeGuidePhone(clean)) ? null : field;
  const length = Array.from(clean).length;
  if (field === 'bio') return length >= 100 && length <= 1000 ? null : field;
  return length >= 1 && length <= 300 ? null : field;
}
