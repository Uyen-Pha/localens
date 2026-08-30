import Link from "next/link";
import Image from "next/image";

import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { PersonalizationPriorityKey } from "@/lib/i18n/dictionaries";

import { PersonalizationForm } from "@/components/customer/personalization-form";

type HomeCopy = Dictionary["home"];

const categoryImages: Record<PersonalizationPriorityKey, string> = {
  street_food: "/images/editorial/category-street-food.webp",
  history: "/images/editorial/category-history.webp",
  traditional_craft: "/images/editorial/category-craft.webp",
  traditional_market: "/images/editorial/category-market.webp",
};

export type CustomerHomeProps = {
  locale: Locale;
  dictionary: Dictionary;
};

export function CustomerHome({ locale, dictionary }: CustomerHomeProps) {
  const copy: HomeCopy = dictionary.home;

  return (
    <div className="customer-home">
      <section className="customer-hero" aria-labelledby="customer-hero-title">
        <div className="customer-hero__content">
          <p className="customer-hero__mark" aria-hidden="true">
            SAI
            <br />
            GON
          </p>
          <h1 id="customer-hero-title">{copy.title}</h1>
          <p className="customer-hero__subtitle">{copy.subtitle}</p>
          <div className="customer-hero__actions" aria-label={copy.heroActionsLabel}>
            <Link className="button button--primary" href={`/${locale}/tours/`}>
              {copy.heroPrimaryCta}
              <span aria-hidden="true"> →</span>
            </Link>
            <Link className="button button--secondary" href={`/${locale}/planner/`}>
              {copy.heroSecondaryCta}
              <span aria-hidden="true"> →</span>
            </Link>
          </div>
          <p className="customer-hero__note">{copy.heroNote}</p>
        </div>
        <div className="customer-hero__visual">
          <div className="customer-hero__image-frame">
            <Image
              className="customer-hero__image"
              src="/images/editorial/saigon-artisan-hero.webp"
              alt={copy.heroImageAlt}
              fill
              priority
              sizes="(max-width: 720px) 100vw, (max-width: 1100px) 56vw, 760px"
            />
          </div>
          <div className="customer-hero__inset">
            <Image
              src="/images/editorial/saigon-post-office-inset.webp"
              alt={copy.heroInsetAlt}
              fill
              sizes="(max-width: 720px) 42vw, 240px"
            />
          </div>
          <p className="customer-hero__coordinates">{copy.heroCoordinates}</p>
        </div>
      </section>

      <section
        className="customer-section customer-section--discovery"
        id="experiences"
        aria-labelledby="discovery-title"
      >
        <div className="experience-grid">
          <div className="experience-intro">
            <p className="eyebrow">{copy.discoveryEyebrow}</p>
            <h2 id="discovery-title">{copy.discoveryTitle}</h2>
            <span className="editorial-rule" aria-hidden="true" />
            <p>{copy.discoveryIntro}</p>
          </div>
          {copy.experienceCategories.map((category) => (
            <article className={`experience-card experience-card--${category.key}`} key={category.key}>
              <Image
                className="experience-card__image"
                src={categoryImages[category.key]}
                alt={category.imageAlt}
                width={256}
                height={256}
                aria-hidden="true"
              />
              <h3>
                <Link href={`/${locale}/tours/`}>
                  {category.title}
                  <span aria-hidden="true"> ↗</span>
                </Link>
              </h3>
              <span className="editorial-rule" aria-hidden="true" />
            </article>
          ))}
        </div>
        <p className="demo-disclosure" role="note">
          {copy.demoDisclosure}
        </p>
      </section>

      <section className="customer-section customer-section--trust" aria-labelledby="trust-title">
        <div className="section-heading section-heading--compact">
          <p className="eyebrow">{copy.trustEyebrow}</p>
          <h2 id="trust-title">{copy.trustTitle}</h2>
          <p>{copy.trustIntro}</p>
        </div>
        <div className="trust-grid">
          {copy.trustItems.map((item) => (
            <article className="trust-card" key={item.icon}>
              <span className="trust-card__number" aria-hidden="true">{item.icon}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="customer-section customer-section--personalization" id="personalize" aria-labelledby="personalization-title">
        <div className="section-heading">
          <p className="eyebrow">{copy.personalizationEyebrow}</p>
          <h2 id="personalization-title">{copy.personalizationTitle}</h2>
          <p>{copy.personalizationIntro}</p>
        </div>
        <PersonalizationForm copy={copy.personalizationForm} locale={locale} />
      </section>
    </div>
  );
}
