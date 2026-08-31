import Link from "next/link";

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type FixedToursCopy = Dictionary["home"];

export function FixedToursGrid({
  locale,
  copy,
  hrefForTour = (id) => `/${locale}/tours/#${id}`,
  headingLevel = "h3",
}: {
  locale: Locale;
  copy: FixedToursCopy;
  hrefForTour?: (id: string) => string;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;

  return (
    <div className="tour-grid tour-grid--editorial">
      {copy.fixedTours.map((tour) => (
        <article className={`tour-card tour-card--${tour.id} tour-card--editorial`} id={tour.id} key={tour.id}>
          <div className="tour-card__topline">
            <span className="tour-card__icon" aria-hidden="true">{tour.icon}</span>
            <span className="tour-card__detail">{tour.detail}</span>
          </div>
          <Heading className="tour-card__title">{tour.title}</Heading>
          <p>{tour.description}</p>
          <Link href={hrefForTour(tour.id)}>
            <span className="sr-only">{tour.title}: </span>
            {copy.fixedToursCta}
          </Link>
        </article>
      ))}
    </div>
  );
}
