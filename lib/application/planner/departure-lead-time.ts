/** The customer must submit at least 72 elapsed hours before departure. */
export const PERSONALIZED_LEAD_TIME_MS = 72 * 60 * 60 * 1000;

export function hasPersonalizedLeadTime(startAt: string, now = Date.now()): boolean {
  const start = Date.parse(startAt);
  return Number.isFinite(start) && start - now >= PERSONALIZED_LEAD_TIME_MS;
}

export function personalizedLeadTimeMessage(locale: 'vi' | 'en'): string {
  return locale === 'vi'
    ? 'Vui lòng chọn giờ khởi hành cách thời điểm gửi yêu cầu ít nhất 72 giờ (giờ TP.HCM, UTC+7).'
    : 'Choose a departure at least 72 hours after submitting your request (Ho Chi Minh City time, UTC+7).';
}
