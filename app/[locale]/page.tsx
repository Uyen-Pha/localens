import Link from "next/link";
import { notFound } from "next/navigation";

import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = getDictionary(locale);

  return (
    <main>
      <h1>{dictionary.home.title}</h1>
      <p>{dictionary.home.subtitle}</p>
      <nav aria-label={dictionary.navigation.explore}>
        <Link href={`/${locale}/explore/`}>
          {dictionary.navigation.explore}
        </Link>
        <Link href={`/${locale}/plan/`}>
          {dictionary.navigation.planTrip}
        </Link>
      </nav>
    </main>
  );
}
