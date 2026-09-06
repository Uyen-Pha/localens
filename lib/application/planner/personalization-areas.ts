import type { Locale } from "@/lib/i18n/config";

export const SYNTHETIC_CENTRAL_AREA_SLUG = "synthetic-central-hcmc" as const;

/** Browser form values are catalog slugs, never labels or free-form notes. */
export const PERSONALIZATION_AREA_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYNTHETIC_AREA_LABELS: Readonly<Record<Locale, string>> = {
  en: "Synthetic Central HCMC Demo Area",
  vi: "Khu trung tâm TP.HCM trình diễn tổng hợp",
};

/**
 * The public areas projection exposes canonical slugs, not localized names.
 * Keep this small trusted map aligned with the existing public geography copy;
 * a slug outside it invalidates the complete list instead of displaying an
 * untrusted or guessed label.
 */
const PUBLIC_AREA_LABELS_BY_SLUG: Readonly<Record<string, Readonly<Record<Locale, string>>>> = {
  "central-historical": {
    en: "District 1 & central",
    vi: "Quận 1 & trung tâm",
  },
  "district-3-cultural": {
    en: "District 3 & museum district",
    vi: "Quận 3 & khu bảo tàng",
  },
  "district-5-chinatown": {
    en: "Cho Lon & District 5",
    vi: "Chợ Lớn & Quận 5",
  },
  "outer-hcmc": {
    en: "Thu Duc",
    vi: "Thủ Đức",
  },
};

export interface PersonalizationAreaOption {
  readonly value: string;
  readonly slug: string;
  readonly areaId: string;
  readonly snapshotId: string;
  readonly label: string;
}

export interface PersonalizationAreaPort {
  listAreas(locale: Locale): Promise<PersonalizationAreaOption[]>;
}

export interface CatalogAreaOptionsInput {
  readonly snapshotId: unknown;
  readonly areas: unknown;
  readonly locale: Locale;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index));
}

function exactRecord(value: unknown, fields: readonly string[]): UnknownRecord | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key) => fields.includes(key)) ? value : null;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

function trustedLabelForSlug(slug: string, locale: Locale): string | null {
  if (slug === SYNTHETIC_CENTRAL_AREA_SLUG) return SYNTHETIC_AREA_LABELS[locale];
  return PUBLIC_AREA_LABELS_BY_SLUG[slug]?.[locale] ?? null;
}

/**
 * Map the narrow public catalog projections into safe browser form options.
 * A missing, mixed, duplicate, or over-shaped row invalidates the complete
 * list so the caller cannot submit a partially trusted catalog selection.
 */
export function normalizeCatalogAreaOptions(
  input: CatalogAreaOptionsInput,
): PersonalizationAreaOption[] | null {
  const snapshotId = uuid(input.snapshotId);
  if (snapshotId === null || (input.locale !== "en" && input.locale !== "vi")) return null;
  if (!isDenseArray(input.areas) || input.areas.length < 1) return null;

  const areaRows: Array<{ snapshotId: string; areaId: string; slug: string }> = [];
  const areaIds = new Set<string>();
  const slugs = new Set<string>();
  for (const value of input.areas) {
    const row = exactRecord(value, ["snapshot_id", "area_id", "slug"]);
    const rowSnapshotId = uuid(row?.snapshot_id);
    const areaId = uuid(row?.area_id);
    const slug = row?.slug;
    if (
      row === null
      || rowSnapshotId !== snapshotId
      || areaId === null
      || typeof slug !== "string"
      || !PERSONALIZATION_AREA_SLUG_PATTERN.test(slug)
      || areaIds.has(areaId)
      || slugs.has(slug)
    ) return null;
    areaIds.add(areaId);
    slugs.add(slug);
    areaRows.push({ snapshotId: rowSnapshotId, areaId, slug });
  }

  const options = areaRows.map(({ snapshotId: rowSnapshotId, areaId, slug }) => ({
    value: slug,
    slug,
    areaId,
    snapshotId: rowSnapshotId,
    label: trustedLabelForSlug(slug, input.locale) ?? "",
  }));
  return options.every((option) => option.label.length > 0) ? options : null;
}

/** Validate submitted values against the catalog list resolved for this tab. */
export function hasValidPersonalizationAreaSelection(
  values: readonly unknown[],
  options: readonly Pick<PersonalizationAreaOption, "value">[],
): values is string[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 12) return false;
  const allowed = new Set(options.map((option) => option.value));
  return values.every((value) => typeof value === "string" && allowed.has(value));
}

export const SYNTHETIC_AREA_LABELS_BY_LOCALE = SYNTHETIC_AREA_LABELS;
