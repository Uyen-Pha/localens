import Link from "next/link";

import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

import { PersonalizationForm } from "@/components/customer/personalization-form";
import { FixedToursGrid } from "@/components/customer/fixed-tours-grid";

type HomeCopy = Dictionary["home"];

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
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 id="customer-hero-title">{copy.title}</h1>
          <p className="customer-hero__subtitle">{copy.subtitle}</p>
          <div className="customer-hero__actions" aria-label={copy.heroActionsLabel}>
            <Link className="button button--primary" href={`/${locale}/tours/`}>
              {copy.heroPrimaryCta}
            </Link>
            <a className="button button--secondary" href="#personalize">
              {copy.heroSecondaryCta}
            </a>
          </div>
          <p className="customer-hero__note">{copy.heroNote}</p>
        </div>
        <div className="customer-hero__visual" aria-hidden="true">
          <div className="hero-orbit hero-orbit--one" />
          <div className="hero-orbit hero-orbit--two" />
          <div className="hero-stamp">
            <span>{copy.heroStampTop}</span>
            <strong>{copy.heroStampLine1}<br />{copy.heroStampLine2}</strong>
          </div>
          <span className="hero-spark hero-spark--one">✦</span>
          <span className="hero-spark hero-spark--two">✦</span>
        </div>
        <p className="customer-hero__trust">{copy.heroTrust}</p>
      </section>

      <section className="customer-section customer-section--discovery" aria-labelledby="discovery-title">
        <div className="section-heading">
          <p className="eyebrow">{copy.discoveryEyebrow}</p>
          <h2 id="discovery-title">{copy.discoveryTitle}</h2>
          <p>{copy.discoveryIntro}</p>
        </div>
        <p className="demo-disclosure" role="note">
          {copy.demoDisclosure}
        </p>
        <FixedToursGrid locale={locale} copy={copy} />
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
        <PersonalizationForm copy={copy.personalizationForm} />
      </section>
    </div>
  );
}
