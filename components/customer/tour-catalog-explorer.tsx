"use client";

import { useEffect, useMemo, useState } from "react";

import {
  createReadOnlyApi,
  type PublicTourCatalogDto,
} from "@/lib/application/api/read-only-api";
import type { ExperienceType, Locale } from "@/lib/domain/itinerary/contracts";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type TourCatalogCopy = Dictionary["home"]["tourCatalog"];

export type TourCatalogError = {
  retryable: boolean;
  correlationId: string;
};

const readOnlyApi = createReadOnlyApi();

function formatVnd(value: string, locale: Locale): string {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatMinutes(value: number, locale: Locale): string {
  return locale === "vi" ? `${value} phút` : `${value} min`;
}

function TourCard({
  locale,
  copy,
  tour,
  areaLabels,
  experienceLabels,
}: {
  locale: Locale;
  copy: TourCatalogCopy;
  tour: PublicTourCatalogDto["tours"][number];
  areaLabels: ReadonlyMap<string, string>;
  experienceLabels: ReadonlyMap<ExperienceType, string>;
}) {
  return (
    <article className="demo-tour-card">
      <h2 className="demo-tour-card__title">{tour.title}</h2>
      <p className="demo-tour-card__summary">{tour.summary}</p>
      <dl className="demo-tour-card__facts">
        <div>
          <dt>{copy.durationLabel}</dt>
          <dd>{formatMinutes(tour.durationMinutes, locale)}</dd>
        </div>
        <div>
          <dt>{copy.priceLabel}</dt>
          <dd>{formatVnd(tour.priceVndMinor, locale)}</dd>
        </div>
        <div>
          <dt>{copy.meetingPointLabel}</dt>
          <dd>{tour.meetingPoint}</dd>
        </div>
        <div>
          <dt>{copy.experienceTypesLabel}</dt>
          <dd>{tour.experienceTypes.map((value) => experienceLabels.get(value) ?? value).join(", ")}</dd>
        </div>
        <div>
          <dt>{copy.areasLabel}</dt>
          <dd>{tour.areaIds.map((value) => areaLabels.get(value) ?? value).join(", ")}</dd>
        </div>
      </dl>

      <details className="demo-tour-card__details">
        <summary>{copy.detailsLabel}</summary>
        <div className="demo-tour-card__details-body">
          <div>
            <h3>{copy.stopsLabel}</h3>
            <ul>
              {tour.stops.map((stop) => (
                <li key={stop.placeId}>
                  <span>{stop.position}. {stop.title}</span> <code>{stop.placeId}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>{copy.inclusionsLabel}</h3>
            <ul>{tour.inclusions.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div>
            <h3>{copy.exclusionsLabel}</h3>
            <ul>{tour.exclusions.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <dl>
            <div><dt>{copy.cancellationPolicyLabel}</dt><dd>{tour.cancellationPolicy}</dd></div>
            <div><dt>{copy.sourceLabel}</dt><dd><code>{tour.sourceUrl}</code></dd></div>
            <div><dt>{copy.attributionLabel}</dt><dd>{tour.attribution}</dd></div>
            <div><dt>{copy.verifiedLabel}</dt><dd>{tour.verifiedAt}</dd></div>
            <div><dt>{copy.licenseLabel}</dt><dd>{tour.license}</dd></div>
          </dl>
        </div>
      </details>
    </article>
  );
}

export function TourCatalogExplorer({
  locale,
  copy,
  areaOptions,
  initialCatalog,
  initialError = null,
}: {
  locale: Locale;
  copy: TourCatalogCopy;
  areaOptions: ReadonlyArray<{ value: string; label: string }>;
  initialCatalog: PublicTourCatalogDto | null;
  initialError?: TourCatalogError | null;
}) {
  const [catalog, setCatalog] = useState<PublicTourCatalogDto | null>(initialCatalog);
  const [error, setError] = useState<TourCatalogError | null>(initialError);
  const [keyword, setKeyword] = useState("");
  const [areaId, setAreaId] = useState("");
  const [experienceType, setExperienceType] = useState<ExperienceType | "">("");
  const [isFiltering, setIsFiltering] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const areaLabels = useMemo(
    () => new Map(areaOptions.map((option) => [option.value, option.label])),
    [areaOptions],
  );
  const experienceLabels = useMemo(
    () => new Map(copy.experienceTypeOptions.map((option) => [option.value, option.label])),
    [copy.experienceTypeOptions],
  );

  useEffect(() => {
    const trimmedKeyword = keyword.trim();
    const hasFilters = trimmedKeyword.length > 0 || areaId.length > 0 || experienceType.length > 0;
    if (!hasFilters && retryNonce === 0) {
      setCatalog(initialCatalog);
      setError(initialError ?? null);
      return;
    }

    setIsFiltering(true);
    const result = readOnlyApi.listTours(locale, {
      ...(trimmedKeyword.length > 0 ? { keyword: trimmedKeyword } : {}),
      ...(areaId.length > 0 ? { areaIds: [areaId] } : {}),
      ...(experienceType.length > 0 ? { experienceTypes: [experienceType] } : {}),
    });
    setIsFiltering(false);
    if (!result.ok) {
      setCatalog(null);
      setError({ retryable: result.error.retryable, correlationId: result.error.correlationId });
      return;
    }
    setError(null);
    setCatalog(result.value);
  }, [areaId, experienceType, initialCatalog, initialError, keyword, locale, retryNonce]);

  function clearFilters() {
    setKeyword("");
    setAreaId("");
    setExperienceType("");
    setRetryNonce(0);
  }

  function retryCatalog() {
    setRetryNonce((value) => value + 1);
  }

  return (
    <div className="tour-catalog-explorer">
      <p className="demo-disclosure" role="note">{copy.disclosure}</p>
      <fieldset className="tour-catalog-filters" aria-label={copy.filtersLegend}>
        <legend>{copy.filtersLegend}</legend>
        <label className="field">
          <span>{copy.keywordLabel}</span>
          <input
            type="search"
            value={keyword}
            placeholder={copy.keywordPlaceholder}
            onChange={(event) => setKeyword(event.target.value)}
            aria-label={copy.keywordLabel}
          />
        </label>
        <label className="field">
          <span>{copy.areaLabel}</span>
          <select value={areaId} onChange={(event) => setAreaId(event.target.value)} aria-label={copy.areaLabel}>
            <option value="">{copy.allAreasLabel}</option>
            {areaOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{copy.experienceLabel}</span>
          <select value={experienceType} onChange={(event) => setExperienceType(event.target.value as ExperienceType | "")} aria-label={copy.experienceLabel}>
            <option value="">{copy.allExperienceTypesLabel}</option>
            {copy.experienceTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button className="button button--secondary" type="button" onClick={clearFilters}>{copy.clearFiltersLabel}</button>
      </fieldset>

      {isFiltering ? <p className="tour-catalog-status" role="status">{copy.filteringStatus}</p> : null}
      {error ? (
        <div className="tour-catalog-error" role="alert">
          <p>{copy.errorMessage}</p>
          {error.retryable ? <p>{copy.retryableMessage}</p> : null}
          {error.retryable ? (
            <button className="button button--secondary" type="button" onClick={retryCatalog}>
              {copy.retryLabel}
            </button>
          ) : null}
          <p>{copy.correlationLabel}: <code>{error.correlationId}</code></p>
        </div>
      ) : null}
      {!error && catalog && catalog.tours.length === 0 ? <p className="tour-catalog-status" role="status">{copy.noResults}</p> : null}
      {catalog && catalog.tours.length > 0 ? (
        <>
          <p className="tour-catalog-count">{catalog.tours.length} {copy.resultCountLabel}</p>
          <div className="demo-tour-grid">
            {catalog.tours.map((tour) => (
              <TourCard
                key={tour.id}
                locale={locale}
                copy={copy}
                tour={tour}
                areaLabels={areaLabels}
                experienceLabels={experienceLabels}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
