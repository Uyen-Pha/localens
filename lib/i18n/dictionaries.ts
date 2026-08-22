import english from "@/messages/en.json";
import vietnamese from "@/messages/vi.json";

import type { Locale } from "@/lib/i18n/config";

export type Dictionary = {
  brand: string;
  home: {
    title: string;
    subtitle: string;
  };
  navigation: {
    primary: string;
    explore: string;
    fixedTours: string;
    planTrip: string;
    signIn: string;
    skipToContent: string;
  };
  language: {
    label: string;
    options: {
      en: string;
      vi: string;
    };
  };
  footer: {
    summary: string;
    copyright: string;
  };
  serviceStatus: {
    available: string;
    degraded: string;
    unavailable: string;
  };
};

const dictionaries = {
  en: english,
  vi: vietnamese,
} satisfies Record<Locale, Dictionary>;

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
