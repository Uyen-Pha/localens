import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export function ThesisDemoBadge({ locale }: { locale: Locale }) {
  return (
    <span className="thesis-demo-badge" role="note">
      {getDictionary(locale).thesisDemoLabel}
    </span>
  );
}
