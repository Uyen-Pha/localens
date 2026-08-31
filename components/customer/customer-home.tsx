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

const greenHeroImages: Record<string, string> = {
  market: "/images/green/ben-thanh-market.webp",
  palace: "/images/green/independence-palace.webp",
  food: "/images/green/street-food.webp",
};

export type CustomerHomeProps = {
  locale: Locale;
  dictionary: Dictionary;
};

export function CustomerHome({ locale, dictionary }: CustomerHomeProps) {
  const copy: HomeCopy = dictionary.home;
  const greenHeroStops = copy.heroStops.map((stop) => ({
    ...stop,
    image: greenHeroImages[stop.id] ?? greenHeroImages.market,
  }));

  return (
    <div className="customer-home customer-home--landing customer-home--green">
      <section className="customer-hero customer-hero--green" aria-labelledby="customer-hero-title">
        <div className="customer-hero__content">
          <Image
            className="customer-hero__skyline"
            src="/images/green/saigon-skyline.webp"
            alt=""
            width={900}
            height={250}
            priority
            aria-hidden="true"
          />
          <h1 id="customer-hero-title">{copy.title}</h1>
          <p className="customer-hero__subtitle">{copy.subtitle}</p>
          <div className="customer-hero__actions" aria-label={copy.heroActionsLabel}>
            <Link className="button button--primary" href={`/${locale}/planner/`}>
              {copy.heroPrimaryCta}
            </Link>
            <Link className="button button--secondary" href={`/${locale}/tours/`}>
              {copy.heroSecondaryCta}
            </Link>
          </div>
          <p className="customer-hero__note">{copy.heroNote}</p>
          <p className="customer-hero__trust">{copy.heroTrust}</p>
        </div>
        <div className="customer-hero__visual">
          <div className="customer-hero__image-frame">
            <Image
              className="customer-hero__map"
              src="/images/green/saigon-map.webp"
              alt={copy.heroImageAlt}
              fill
              priority
              sizes="(max-width: 720px) 100vw, (max-width: 1100px) 58vw, 840px"
            />
            <div className="customer-hero__map-labels" aria-hidden="true">
              <span className="customer-hero__map-label customer-hero__map-label--north">{copy.heroMapLabels.north}</span>
              <span className="customer-hero__map-label customer-hero__map-label--central">{copy.heroMapLabels.central}</span>
              <span className="customer-hero__map-label customer-hero__map-label--district">{copy.heroMapLabels.district}</span>
              <span className="customer-hero__map-label customer-hero__map-label--river">{copy.heroMapLabels.river}</span>
            </div>
          </div>
          <p className="customer-hero__coordinates">{copy.heroCoordinates}</p>
          <aside
            className="customer-hero__summary customer-hero__route-card"
            aria-label={copy.heroRoute.ariaLabel}
            aria-describedby={`customer-hero-summary-disclosure-${locale}`}
          >
            <p className="customer-hero__summary-disclosure" id={`customer-hero-summary-disclosure-${locale}`}>
              {copy.heroRoute.disclosure}
            </p>
            <div className="customer-hero__summary-topline">
              <p><strong>~6.5 h</strong><span>{copy.heroRoute.totalTimeLabel}</span></p>
              <p><strong>~58 USD</strong><span>{copy.heroRoute.perPersonLabel}</span></p>
            </div>
            <p className="customer-hero__summary-mode"><strong>{copy.heroRoute.modeValue}</strong><span>{copy.heroRoute.modeLabel}</span></p>
            <p className="customer-hero__summary-date"><strong>{copy.heroRoute.dateValue}</strong><span>{copy.heroRoute.paceValue}</span></p>
          </aside>
          <ol
            className="customer-hero__stops"
            aria-label={copy.heroRoute.stopsLabel}
            aria-describedby={`customer-hero-summary-disclosure-${locale}`}
          >
            {greenHeroStops.map((stop) => (
              <li key={stop.id}>
                <p className="customer-hero__stop-time">{stop.time}</p>
                <Image src={stop.image} alt={stop.alt} width={256} height={144} sizes="(max-width: 720px) 30vw, 220px" />
                <h2>{stop.title}</h2>
                <p>{stop.description}</p>
              </li>
            ))}
          </ol>
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

      <section id="how-it-works" className="customer-section customer-section--trust" aria-labelledby="trust-title">
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
