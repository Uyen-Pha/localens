import english from "@/messages/en.json";
import vietnamese from "@/messages/vi.json";

import type { Locale } from "@/lib/i18n/config";

export type Dictionary = {
  home: {
    title: string;
    subtitle: string;
  };
  navigation: {
    explore: string;
    planTrip: string;
  };
};

const dictionaries = {
  en: english,
  vi: vietnamese,
} satisfies Record<Locale, Dictionary>;

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
