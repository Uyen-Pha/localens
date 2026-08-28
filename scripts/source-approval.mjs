import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const OFFICIAL_HOST_ALLOWLIST = Object.freeze([
  "aodaomuseum.com",
  "baotangphunu.com",
  "baotangtonducthang.vn",
  "baotangchungtichchientranh.vn",
  "www.baotanglichsutphcm.com.vn",
  "dinhdoclap.gov.vn",
  "fitomuseum.com.vn",
  "hcmc-museum.edu.vn",
  "banhmihuynhhoa.vn",
  "svhtt.hochiminhcity.gov.vn",
  "visithcmc.net",
  "cuchitunnel.org.vn",
]);

export const EXPECTED_COUNTS = Object.freeze({ operationalAreas: 4, places: 30, tours: 8 });
export const REQUIRED_PLACE_SLUGS = Object.freeze([
  "independence-palace", "war-remnants-museum", "ho-chi-minh-city-museum", "history-museum-hcmc",
  "central-post-office", "fine-arts-museum-hcmc", "southern-womens-museum", "ton-duc-thang-museum",
  "giac-lam-pagoda", "cu-chi-tunnels", "ben-thanh-market", "tan-dinh-market", "an-dong-market",
  "binh-tay-market", "thiec-market", "pham-van-hai-market", "ba-hoa-market", "ho-thi-ky-food-street",
  "alley-200-xom-chieu", "banh-mi-hoa-ma", "banh-mi-huynh-hoa", "nguyen-hue-walking-street",
  "tue-thanh-assembly-hall", "fito-museum", "district-5-traditional-medicine-street", "vietnam-silver-house",
  "mot-thoang-viet-nam-craft-village", "rice-paper-phu-hoa-dong", "ao-dai-museum", "hoa-binh-lantern-making",
]);

const EXPECTED_SOURCE_IDS_BY_PLACE = Object.freeze({
  "ho-chi-minh-city-museum": { sourceId: "hcmc-museum", url: "https://hcmc-museum.edu.vn/trang-chu-english" },
  "southern-womens-museum": { sourceId: "southern-womens-museum", url: "https://baotangphunu.com/" },
  "ton-duc-thang-museum": { sourceId: "ton-duc-thang-museum", url: "https://baotangtonducthang.vn/ngoi-sao-bien-den" },
  "ho-thi-ky-food-street": { sourceId: "street-food", url: "https://visithcmc.net/en/news/nhung-dia-diem-am-thuc-duong-pho-tai-sai-gon" },
  "alley-200-xom-chieu": { sourceId: "street-food", url: "https://visithcmc.net/en/news/nhung-dia-diem-am-thuc-duong-pho-tai-sai-gon" },
  "banh-mi-hoa-ma": { sourceId: "hoa-ma", url: "https://visithcmc.net/en/news/10-mon-banh-mi-phai-thuong-thuc-tai-tphcm" },
  "banh-mi-huynh-hoa": { sourceId: "huynh-hoa", url: "https://banhmihuynhhoa.vn/" },
  "an-dong-market": { sourceId: "cho-lon", url: "https://visithcmc.net/en/news/kham-pha-cho-lon-khu-pho-nguoi-hoa-tai-thanh-pho" },
  "binh-tay-market": { sourceId: "cho-lon", url: "https://visithcmc.net/en/news/kham-pha-cho-lon-khu-pho-nguoi-hoa-tai-thanh-pho" },
  "thiec-market": { sourceId: "cho-lon", url: "https://visithcmc.net/en/news/kham-pha-cho-lon-khu-pho-nguoi-hoa-tai-thanh-pho" },
  "tue-thanh-assembly-hall": { sourceId: "cho-lon", url: "https://visithcmc.net/en/news/kham-pha-cho-lon-khu-pho-nguoi-hoa-tai-thanh-pho" },
  "district-5-traditional-medicine-street": { sourceId: "cho-lon", url: "https://visithcmc.net/en/news/kham-pha-cho-lon-khu-pho-nguoi-hoa-tai-thanh-pho" },
  "vietnam-silver-house": { sourceId: "cho-lon", url: "https://visithcmc.net/en/news/kham-pha-cho-lon-khu-pho-nguoi-hoa-tai-thanh-pho" },
  "rice-paper-phu-hoa-dong": { sourceId: "craft-report", url: "https://svhtt.hochiminhcity.gov.vn/documents/10184/428712/Tap%2Btai%2Blieu%2Bbao%2Bcao.pdf/0b5e54dc-5fcd-466e-ba8d-d3437d527886" },
  "hoa-binh-lantern-making": { sourceId: "craft-report", url: "https://svhtt.hochiminhcity.gov.vn/documents/10184/428712/Tap%2Btai%2Blieu%2Bbao%2Bcao.pdf/0b5e54dc-5fcd-466e-ba8d-d3437d527886" },
});

const PLACE_FILE = join("data", "sources", "hcmc-places.v1.json");
const TOUR_FILE = join("data", "sources", "hcmc-tours.v1.json");
const HASH_FILE = join("data", "sources", "source-hashes.v1.json");
const APPROVAL_FILE = join("data", "approvals", "hcmc-catalog.v1.json");

export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalSha256(value) {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

function addError(errors, message) {
  errors.push(message);
}

function readJson(root, relativePath, errors) {
  try {
    return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
  } catch (error) {
    addError(errors, `${relativePath}: cannot read valid JSON (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
}

function checkDate(value, field, errors) {
  if (typeof value !== "string" || !/^2026-08-25(?:T00:00:00Z)?$/.test(value)) {
    addError(errors, `${field} must be the checked research date 2026-08-25`);
  }
}

export function sanitizeOfficialUrl(value, allowedHosts = OFFICIAL_HOST_ALLOWLIST) {
  if (typeof value !== "string" || value !== value.trim() || /[\u0000-\u001f\u007f\s]/.test(value)) {
    return { ok: false, reason: "URL must be a trimmed HTTPS URL without whitespace or control characters" };
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "URL is not parseable" };
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:") return { ok: false, reason: "URL must use HTTPS" };
  if (url.username || url.password) return { ok: false, reason: "URL credentials are forbidden" };
  const authority = value.slice("https://".length).split(/[/?#]/, 1)[0];
  if (url.port || authority.includes(":")) return { ok: false, reason: "URL ports are forbidden" };
  if (url.hash) return { ok: false, reason: "URL fragments are forbidden" };
  if (host.startsWith("xn--") || host.includes(".xn--") || host === "localhost" || isIP(host)) {
    return { ok: false, reason: "localhost, IP, and punycode hosts are forbidden" };
  }
  if (!allowedHosts.includes(host)) return { ok: false, reason: `host ${host} is not in the exact official allowlist` };
  for (const [key] of url.searchParams) {
    const lower = key.toLowerCase();
    if (/^(utm_[^=&#]*|fbclid|gclid|msclkid|dclid)$/.test(lower)) return { ok: false, reason: "tracking query parameters are forbidden" };
    if (/(^|_)(email|phone|name|token|session|user|customer|address|ip)(_|$)/.test(lower)) return { ok: false, reason: "PII query parameters are forbidden" };
  }
  if (/%[0-9a-f]{2}/i.test(url.search)) return { ok: false, reason: "encoded query values are forbidden" };
  return { ok: true, host };
}

function checkBilingual(value, field, errors) {
  if (!value || typeof value !== "object" || typeof value.en !== "string" || typeof value.vi !== "string" || !value.en.trim() || !value.vi.trim()) {
    addError(errors, `${field} must contain non-empty EN and VI copy`);
  }
}

const FOOD_STATUSES = new Set(["research_only", "sellable", "temporarily_closed"]);
const FOOD_SERVICE_TYPES = new Set(["stall", "shop", "food_court", "street_vendor"]);
const FOOD_SERVING_UNITS = new Set(["portion", "bowl", "piece", "drink", "shared_set"]);
const FOOD_SUPPORT_STATUSES = new Set(["supported", "unsupported", "unknown"]);
const FOOD_AVAILABILITY_STATUSES = new Set(["available", "unavailable", "unknown", "research_only", "sellable", "temporarily_closed"]);

function hasRegisteredSourceUrl(value, registry) {
  return typeof value === "string" && [...registry.values()].some((url) => url === value);
}

function checkFoodSourceUrl(value, field, registry, errors) {
  const urlCheck = sanitizeOfficialUrl(value);
  if (!urlCheck.ok) addError(errors, field + ": " + urlCheck.reason);
  if (typeof value === "string" && !hasRegisteredSourceUrl(value, registry)) addError(errors, field + " must match an exact registered source URL");
}

function checkFoodSupport(value, field, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) {
    addError(errors, field + " must declare support statuses");
    return;
  }
  for (const [requirement, status] of Object.entries(value)) {
    if (!requirement.trim() || !FOOD_SUPPORT_STATUSES.has(status)) addError(errors, field + "." + requirement + " must be supported, unsupported, or unknown");
  }
}

function checkFoodHours(value, field, registry, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, field + " must contain at least one opening window");
    return;
  }
  for (const [windowIndex, window] of value.entries()) {
    const prefix = field + "[" + windowIndex + "]";
    if (!window || typeof window !== "object" || typeof window.days !== "string" || !window.days.trim()) addError(errors, prefix + ".days is required");
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(window?.opens ?? "") || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(window?.closes ?? "")) addError(errors, prefix + " must use valid HH:mm opening and closing times");
    if (window?.opens === window?.closes) addError(errors, prefix + " cannot have equal opening and closing time");
    if (window?.sourceId !== undefined && !registry.has(window.sourceId)) addError(errors, prefix + ".sourceId must reference the source registry");
  }
}

function isFoodPlace(place) {
  return Array.isArray(place?.experienceTypes) && place.experienceTypes.some((type) => ["street_food", "traditional_market"].includes(type));
}

function isKnownFoodPrice(item) {
  return Number.isSafeInteger(item?.priceVndMin) && item.priceVndMin >= 0
    && Number.isSafeInteger(item?.priceVndMax) && item.priceVndMax >= 0
    && item.priceVndMin <= item.priceVndMax;
}

function isAvailableFoodItem(item) {
  return item?.available === true || item?.availability === true || item?.availability === "available" || item?.availability === "sellable";
}

export function checkFoodMenuItem(vendor, item, index, registry, errors, pathPrefix = "menuItems") {
  const prefix = pathPrefix + "[" + index + "]";
  if (!item || typeof item !== "object") {
    addError(errors, prefix + " must be an object");
    return;
  }
  if (typeof item.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) addError(errors, prefix + ".slug is invalid");
  if (!FOOD_STATUSES.has(item.status)) addError(errors, prefix + ".status must be research_only, sellable, or temporarily_closed");
  checkBilingual(item.title, prefix + ".title", errors);
  checkBilingual(item.description, prefix + ".description", errors);
  if (!FOOD_SERVING_UNITS.has(item.servingUnit)) addError(errors, prefix + ".servingUnit is invalid");
  if (!Number.isSafeInteger(item.priceVndMin) || item.priceVndMin < 0 || !Number.isSafeInteger(item.priceVndMax) || item.priceVndMax < 0) {
    addError(errors, prefix + ".priceVndMin and " + prefix + ".priceVndMax must be non-negative integers; unknown price cannot be treated as zero");
  } else if (item.priceVndMin > item.priceVndMax) {
    addError(errors, prefix + ".priceVndMin cannot exceed " + prefix + ".priceVndMax");
  }
  if (item.available !== undefined && typeof item.available !== "boolean") addError(errors, prefix + ".available must be boolean when supplied");
  if (item.availability === undefined && item.available === undefined) {
    addError(errors, prefix + ".availability must explicitly declare current availability");
  } else if (item.availability !== undefined && (typeof item.availability !== "boolean" && !FOOD_AVAILABILITY_STATUSES.has(item.availability))) {
    addError(errors, prefix + ".availability must explicitly declare current availability");
  }
  checkFoodSupport(item.dietary ?? item.support ?? item.dietarySupport, prefix + ".dietary", errors);
  if (!Array.isArray(item.allergens) || item.allergens.some((allergen) => typeof allergen !== "string" || !allergen.trim())) addError(errors, prefix + ".allergens must be an array of non-empty strings");
  checkFoodSourceUrl(item.sourceUrl, prefix + ".sourceUrl", registry, errors);
  checkDate(item.verifiedAt, prefix + ".verifiedAt", errors);
  if (item.status === "sellable" && (!isAvailableFoodItem(item) || !isKnownFoodPrice(item))) {
    addError(errors, prefix + ".sellable requires available status and known integer price bounds");
  }
  if (vendor && typeof vendor === "object" && item.vendorSlug !== undefined && item.vendorSlug !== vendor.slug) addError(errors, prefix + ".vendorSlug must match its parent vendor");
}

export function checkFoodVendor(place, vendor, index, registry, errors, pathPrefix = "foodVendors") {
  const prefix = pathPrefix + "[" + index + "]";
  if (!vendor || typeof vendor !== "object") {
    addError(errors, prefix + " must be an object");
    return;
  }
  if (typeof vendor.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(vendor.slug)) addError(errors, prefix + ".slug is invalid");
  if (!FOOD_STATUSES.has(vendor.status)) addError(errors, prefix + ".status must be research_only, sellable, or temporarily_closed");
  checkBilingual(vendor.title, prefix + ".title", errors);
  if (vendor.description !== undefined) checkBilingual(vendor.description, prefix + ".description", errors);
  if (typeof vendor.locationNote !== "string" || !vendor.locationNote.trim()) addError(errors, prefix + ".locationNote is required");
  if (!FOOD_SERVICE_TYPES.has(vendor.serviceType)) addError(errors, prefix + ".serviceType is invalid");
  checkFoodHours(vendor.hours, prefix + ".hours", registry, errors);
  checkFoodSupport(vendor.support ?? vendor.dietarySupport, prefix + ".support", errors);
  if (!Array.isArray(vendor.menuItems)) addError(errors, prefix + ".menuItems must be an array");
  const menuSlugs = new Set();
  for (const [itemIndex, item] of (vendor.menuItems ?? []).entries()) {
    checkFoodMenuItem(vendor, item, itemIndex, registry, errors, prefix + ".menuItems");
    if (item && menuSlugs.has(item.slug)) addError(errors, prefix + ".menuItems contains duplicate slug " + item.slug);
    if (item) menuSlugs.add(item.slug);
  }
  checkFoodSourceUrl(vendor.sourceUrl, prefix + ".sourceUrl", registry, errors);
  checkDate(vendor.verifiedAt, prefix + ".verifiedAt", errors);
  if (vendor.status === "sellable" && (!Array.isArray(vendor.menuItems) || vendor.menuItems.length === 0)) addError(errors, prefix + ".sellable requires menuItems");
  if (vendor.placeSlug !== undefined && vendor.placeSlug !== place?.slug) addError(errors, prefix + ".placeSlug must match its parent place");
}

function checkRegistry(manifest, errors) {
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    addError(errors, "places.sources must be a non-empty source registry");
    return new Map();
  }
  const registry = new Map();
  for (const source of manifest.sources) {
    if (!source || typeof source.sourceId !== "string" || registry.has(source.sourceId)) {
      addError(errors, "source registry IDs must be unique non-empty strings");
      continue;
    }
    const check = sanitizeOfficialUrl(source.url);
    if (!check.ok) addError(errors, `source ${source.sourceId} URL: ${check.reason}`);
    if (source.hostname !== check.host) addError(errors, `source ${source.sourceId}.hostname must match the sanitized URL host`);
    if (!['official', 'primary'].includes(source.authority)) addError(errors, `source ${source.sourceId}.authority must be official or primary`);
    if (source.primary !== true) addError(errors, `source ${source.sourceId} must be marked primary: true`);
    checkDate(source.retrievedAtUtc, `source ${source.sourceId}.retrievedAtUtc`, errors);
    checkDate(source.verifiedAt, `source ${source.sourceId}.verifiedAt`, errors);
    for (const key of ["publisher", "attribution", "license", "notes"]) {
      if (typeof source[key] !== "string" || !source[key].trim()) addError(errors, `source ${source.sourceId}.${key} is required`);
    }
    if (typeof source.license === "string" && !/no open license|research|attribution/i.test(source.license)) {
      addError(errors, `source ${source.sourceId}.license must preserve the no-open-license caveat`);
    }
    registry.set(source.sourceId, source.url);
  }
  return registry;
}

function checkPlace(place, index, registry, errors) {
  const prefix = `places[${index}]`;
  if (!place || typeof place.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(place.slug)) addError(errors, `${prefix}.slug is invalid`);
  if (!place || !["sellable", "research_only", "temporarily_closed"].includes(place.status)) addError(errors, `${prefix}.status must be sellable, research_only, or temporarily_closed`);
  checkBilingual(place.title, `${prefix}.title`, errors);
  checkBilingual(place.summary, `${prefix}.summary`, errors);
  checkBilingual(place.description, `${prefix}.description`, errors);
  if (!Array.isArray(place.experienceTypes) || place.experienceTypes.length === 0) addError(errors, `${prefix}.experienceTypes is required`);
  if (!Number.isInteger(place.visitDurationMinutes) || place.visitDurationMinutes < 15 || place.visitDurationMinutes > 480) addError(errors, `${prefix}.visitDurationMinutes is invalid`);
  if (!Number.isInteger(place.priceVndPerPerson) || place.priceVndPerPerson < 0) addError(errors, `${prefix}.priceVndPerPerson is invalid`);
  if (place.priceProvenance !== "localens_demo_company_price") addError(errors, `${prefix}.priceProvenance must be localens_demo_company_price`);
  const urlCheck = sanitizeOfficialUrl(place.sourceUrl);
  if (!urlCheck.ok) addError(errors, `${prefix}.sourceUrl: ${urlCheck.reason}`);
  if (typeof place.sourceUrl === "string" && ![...registry.values()].includes(place.sourceUrl)) addError(errors, `${prefix}.sourceUrl is not registered in the source registry`);
  if (!Array.isArray(place.sourceIds) || place.sourceIds.length === 0 || place.sourceIds.some((id) => !registry.has(id))) addError(errors, `${prefix}.sourceIds must reference the source registry`);
  if (Array.isArray(place.sourceIds) && typeof place.sourceUrl === "string" && !place.sourceIds.some((id) => registry.get(id) === place.sourceUrl)) addError(errors, `${prefix}.sourceUrl must match one of its sourceIds`);
  const expectedSource = EXPECTED_SOURCE_IDS_BY_PLACE[place.slug];
  if (expectedSource && (!Array.isArray(place.sourceIds) || !place.sourceIds.includes(expectedSource.sourceId))) addError(errors, `${prefix} must retain exact source ${expectedSource.sourceId}; generic candidate source is insufficient`);
  if (expectedSource && place.sourceUrl !== expectedSource.url) addError(errors, `${prefix}.sourceUrl must equal the exact registered URL for ${expectedSource.sourceId}`);
  checkDate(place.verifiedAt, `${prefix}.verifiedAt`, errors);
  if (!Array.isArray(place.unknownFacts) || place.unknownFacts.length === 0) addError(errors, `${prefix}.unknownFacts must explicitly record unknown facts`);
  if (!Array.isArray(place.evidenceOnlyFields) || place.evidenceOnlyFields.length === 0) addError(errors, `${prefix}.evidenceOnlyFields must preserve non-schema evidence fields`);
  for (const field of place.evidenceOnlyFields ?? []) {
    if (!Object.prototype.hasOwnProperty.call(place, field)) addError(errors, `${prefix}.evidenceOnlyFields declares missing embedded field ${field}`);
  }
  if (!place.coordinates || place.coordinates.status !== "unknown" || place.coordinates.latitude !== null || place.coordinates.longitude !== null) addError(errors, `${prefix}.coordinates must remain explicitly unknown unless sourced`);
  if (!place.hours || !["known", "unknown"].includes(place.hours.status) || !Array.isArray(place.hours.windows)) addError(errors, `${prefix}.hours must declare known/unknown status and windows`);
  if (place.status === "sellable" && (place.hours.status !== "known" || place.hours.windows.length === 0)) addError(errors, `${prefix}.sellable requires verified opening windows`);
  if (place.hours?.status === "unknown" && place.hours.windows.length !== 0) addError(errors, `${prefix}.unknown hours must have no windows`);
  if (place.hours?.status === "known") {
    if (place.hours.windows.length === 0) addError(errors, `${prefix}.known hours require at least one window`);
    for (const [windowIndex, window] of place.hours.windows.entries()) {
      if (!/^\d{2}:\d{2}$/.test(window.opens ?? "") || !/^\d{2}:\d{2}$/.test(window.closes ?? "")) addError(errors, `${prefix}.hours.windows[${windowIndex}] must use HH:mm`);
      if (!registry.has(window.sourceId)) addError(errors, `${prefix}.hours.windows[${windowIndex}].sourceId is not registered`);
      if (window.opens === window.closes) addError(errors, `${prefix}.hours.windows[${windowIndex}] cannot have equal opening and closing time`);
    }
  }
  if (place.languageSupportConfidence === undefined) addError(errors, `${prefix}.languageSupportConfidence is required`);
  const admission = place.officialAdmission;
  if (!admission || !["known", "unknown"].includes(admission.status) || admission.currency !== "VND") addError(errors, `${prefix}.officialAdmission must declare VND known/unknown status`);
  if (admission?.status === "known" && (!Number.isInteger(admission.amountVnd) || admission.amountVnd < 0 || !registry.has(admission.sourceRef) || typeof admission.scopeCaveat !== "string" || !admission.scopeCaveat.trim())) addError(errors, `${prefix}.known officialAdmission requires a non-negative amount, registered sourceRef, and scopeCaveat`);
  if (admission?.status === "unknown" && (admission.amountVnd !== null || admission.sourceRef !== null)) addError(errors, `${prefix}.unknown officialAdmission must have null amount/sourceRef`);
  if (!place.planningEstimate || !Number.isInteger(place.planningEstimate.amountVnd) || place.planningEstimate.currency !== "VND" || place.planningEstimate.provenance !== "localens_demo_company_price" || place.planningEstimate.isOfficialAdmission !== false) addError(errors, `${prefix}.planningEstimate must be a non-official LocalLens demo estimate`);
  const foodVendors = place.foodVendors ?? [];
  if (!Array.isArray(foodVendors)) {
    addError(errors, prefix + ".foodVendors must be an array when supplied");
  } else {
    const vendorSlugs = new Set();
    for (const [vendorIndex, vendor] of foodVendors.entries()) {
      checkFoodVendor(place, vendor, vendorIndex, registry, errors, prefix + ".foodVendors");
      if (vendor && vendorSlugs.has(vendor.slug)) addError(errors, prefix + ".foodVendors contains duplicate slug " + vendor.slug);
      if (vendor) vendorSlugs.add(vendor.slug);
    }
    if (place.status === "sellable" && isFoodPlace(place)) {
      const hasSellableFood = foodVendors.some((vendor) => vendor?.status === "sellable"
        && Array.isArray(vendor.menuItems)
        && vendor.menuItems.some((item) => item?.status === "sellable" && isAvailableFoodItem(item) && isKnownFoodPrice(item)));
      if (!hasSellableFood) addError(errors, prefix + ".sellable food place requires a sellable vendor with an available, priced sellable menu item");
    }
  }
}

function checkPlaceEvidence(place, registry, errors) {
  const prefix = `places.${place.slug}`;
  const address = place.officialAddress;
  if (!address || !["known", "unknown"].includes(address.status) || typeof address.verifiedAt !== "string") addError(errors, `${prefix}.officialAddress must declare status and verifiedAt`);
  if (address?.verifiedAt) checkDate(address.verifiedAt, `${prefix}.officialAddress.verifiedAt`, errors);
  if (address?.status === "known" && (typeof address.value !== "string" || !address.value.trim())) addError(errors, `${prefix}.officialAddress known value is required`);
  if (address?.status === "unknown" && address.value !== null) addError(errors, `${prefix}.officialAddress unknown value must be null`);
  if (address?.status === "unknown" && address.sourceRef !== null) addError(errors, `${prefix}.officialAddress unknown sourceRef must be null`);
  if (address?.status === "known" && !registry.has(address?.sourceRef)) addError(errors, `${prefix}.officialAddress known sourceRef must be registered`);
  if (address?.sourceRef !== null && !registry.has(address?.sourceRef)) addError(errors, `${prefix}.officialAddress.sourceRef is not registered`);
  const factRefs = place.factSourceRefs;
  for (const field of ["identity", "hours", "admission"]) {
    if (!Array.isArray(factRefs?.[field]) || factRefs[field].some((id) => !registry.has(id))) addError(errors, `${prefix}.factSourceRefs.${field} must use registered source IDs`);
  }
  if (place.hours?.status === "unknown" && (factRefs?.hours?.length ?? 0) > 0) addError(errors, `${prefix}.factSourceRefs.hours must be empty when hours are unknown`);
  if (place.officialAdmission?.status === "unknown" && (factRefs?.admission?.length ?? 0) > 0) addError(errors, `${prefix}.factSourceRefs.admission must be empty when admission is unknown`);
  for (const supportKind of ["language", "accessibility", "dietary", "mobility"]) {
    const support = place.support?.[supportKind];
    if (!support || !["unknown", "low", "medium", "high"].includes(support.confidence)) addError(errors, `${prefix}.support.${supportKind}.confidence is invalid`);
    if (support?.confidence === "unknown" && support.sourceRef !== null) addError(errors, `${prefix}.support.${supportKind} unknown sourceRef must be null`);
    if (support?.sourceRef !== null && !registry.has(support?.sourceRef)) addError(errors, `${prefix}.support.${supportKind}.sourceRef is not registered`);
  }
}

function checkTour(tour, index, placeBySlug, registry, errors) {
  const prefix = `tours[${index}]`;
  if (!tour || typeof tour.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tour.slug)) addError(errors, `${prefix}.slug is invalid`);
  checkBilingual(tour.title, `${prefix}.title`, errors);
  checkBilingual(tour.summary, `${prefix}.summary`, errors);
  checkBilingual(tour.meetingPoint, `${prefix}.meetingPoint`, errors);
  if (!Array.isArray(tour.stops) || tour.stops.length < 2) addError(errors, `${prefix}.stops must contain at least two place slugs`);
  for (const [position, slug] of (tour.stops ?? []).entries()) {
    if (typeof slug !== "string" || !placeBySlug.has(slug)) addError(errors, `${prefix}.stops[${position}] does not reference a place in the 30-place manifest`);
  }
  const unavailableByStop = (tour.stops ?? []).some((slug) => placeBySlug.get(slug)?.status !== "sellable");
  if (unavailableByStop && tour.available !== false) addError(errors, `${prefix}.available must be false when any stop is not verified sellable`);
  if (typeof tour.available !== "boolean") addError(errors, `${prefix}.available must be boolean`);
  if (!Number.isInteger(tour.durationMinutes) || tour.durationMinutes < 30 || tour.durationMinutes > 1440) addError(errors, `${prefix}.durationMinutes is invalid`);
  if (!Number.isInteger(tour.priceVndPerPerson) || tour.priceVndPerPerson < 0) addError(errors, `${prefix}.priceVndPerPerson is invalid`);
  if (tour.priceProvenance !== "localens_demo_company_price") addError(errors, `${prefix}.priceProvenance must be localens_demo_company_price`);
  const urlCheck = sanitizeOfficialUrl(tour.sourceUrl);
  if (!urlCheck.ok) addError(errors, `${prefix}.sourceUrl: ${urlCheck.reason}`);
  if (!Array.isArray(tour.sourceIds) || tour.sourceIds.length === 0 || tour.sourceIds.some((id) => !registry.has(id))) addError(errors, `${prefix}.sourceIds must reference the source registry`);
  if (typeof tour.sourceUrl === "string" && Array.isArray(tour.sourceIds) && !tour.sourceIds.some((id) => registry.get(id) === tour.sourceUrl)) addError(errors, `${prefix}.sourceUrl must match one of its sourceIds`);
  checkDate(tour.verifiedAt, `${prefix}.verifiedAt`, errors);
  if (!Array.isArray(tour.stopActivities) || tour.stopActivities.length !== (tour.stops ?? []).length) addError(errors, `${prefix}.stopActivities must preserve bilingual activity copy for every stop`);
  for (const [position, activity] of (tour.stopActivities ?? []).entries()) checkBilingual(activity, `${prefix}.stopActivities[${position}]`, errors);
  if (!Array.isArray(tour.unknownFacts) || tour.unknownFacts.length === 0) addError(errors, `${prefix}.unknownFacts must be explicit`);
}

export function checkCatalogBundle({ root, approvalMode = "draft" }) {
  const errors = [];
  const places = readJson(root, PLACE_FILE, errors);
  const tours = readJson(root, TOUR_FILE, errors);
  const hashes = readJson(root, HASH_FILE, errors);
  const approval = readJson(root, APPROVAL_FILE, errors);
  if (!places || !tours || !hashes || !approval) return { ok: false, errors, counts: null };

  if (places.schemaVersion !== "hcmc-places.v1" || tours.schemaVersion !== "hcmc-tours.v1" || hashes.schemaVersion !== "source-hashes.v1" || approval.schemaVersion !== "hcmc-catalog.v1") addError(errors, "all Task 14 manifest schema versions must be exact");
  checkDate(places.retrievedAtUtc, "places.retrievedAtUtc", errors);
  checkDate(tours.retrievedAtUtc, "tours.retrievedAtUtc", errors);
  checkDate(places.verifiedAt, "places.verifiedAt", errors);
  checkDate(tours.verifiedAt, "tours.verifiedAt", errors);
  const registry = checkRegistry(places, errors);

  if (!Array.isArray(places.operationalAreas) || places.operationalAreas.length !== EXPECTED_COUNTS.operationalAreas) addError(errors, "exactly four operational areas are required");
  const areaSlugs = new Set((places.operationalAreas ?? []).map((area) => area.slug));
  if (areaSlugs.size !== (places.operationalAreas ?? []).length) addError(errors, "operational area slugs must be unique");
  for (const [index, area] of (places.operationalAreas ?? []).entries()) {
    checkBilingual(area.name, `operationalAreas[${index}].name`, errors);
    checkBilingual(area.description, `operationalAreas[${index}].description`, errors);
  }

  if (!Array.isArray(places.places) || places.places.length !== EXPECTED_COUNTS.places) addError(errors, "exactly 30 places are required");
  const placeBySlug = new Map();
  for (const [index, place] of (places.places ?? []).entries()) {
    checkPlace(place, index, registry, errors);
    if (placeBySlug.has(place.slug)) addError(errors, `duplicate place slug ${place.slug}`);
    placeBySlug.set(place.slug, place);
    if (!areaSlugs.has(place.operationalArea)) addError(errors, `place ${place.slug} references an unknown operational area`);
    checkPlaceEvidence(place, registry, errors);
  }
  for (const slug of REQUIRED_PLACE_SLUGS) if (!placeBySlug.has(slug)) addError(errors, `required place ${slug} is missing`);
  const pricing = places.pricingPolicy;
  if (pricing?.planningEstimateProvenance !== "localens_demo_company_price" || pricing?.planningEstimateIsOfficialAdmission !== false) addError(errors, "place planning prices must be explicitly separate from official admission prices");

  if (!Array.isArray(tours.tours) || tours.tours.length !== EXPECTED_COUNTS.tours) addError(errors, "exactly eight tours are required");
  const tourSlugs = new Set();
  for (const [index, tour] of (tours.tours ?? []).entries()) {
    checkTour(tour, index, placeBySlug, registry, errors);
    if (tourSlugs.has(tour.slug)) addError(errors, `duplicate tour slug ${tour.slug}`);
    tourSlugs.add(tour.slug);
  }
  if (tours.demoFx?.environment !== "demo" || tours.demoFx?.status !== "stale" || tours.demoFx?.usdEnabled !== false || tours.demoFx?.staleReason === undefined) addError(errors, "demo FX must be explicitly stale and USD-disabled");
  if (tours.currencyPolicy?.usdEnabled !== false || tours.currencyPolicy?.usdDisabledReason === undefined) addError(errors, "USD must remain disabled while demo FX is stale");

  const placeHash = canonicalSha256(places);
  const tourHash = canonicalSha256(tours);
  if (hashes.algorithm !== "sha256" || hashes.canonicalization !== "recursive_sorted_object_keys_arrays_semantic_order") addError(errors, "source-hashes must declare canonical SHA-256 rules");
  if (hashes.manifests?.places?.sha256 !== placeHash) addError(errors, "places source hash does not match canonical manifest");
  if (hashes.manifests?.tours?.sha256 !== tourHash) addError(errors, "tours source hash does not match canonical manifest");
  if (hashes.manifests?.places?.recordCount !== EXPECTED_COUNTS.places || hashes.manifests?.tours?.recordCount !== EXPECTED_COUNTS.tours) addError(errors, "source-hashes record counts are incorrect");

  if (approvalMode === "approved") {
    if (approval.status !== "approved" || approval.reviewer?.status !== "approved" || typeof approval.reviewer?.name !== "string" || !approval.reviewer.name.trim() || typeof approval.reviewer?.userId !== "string" || !approval.reviewer.userId.trim()) addError(errors, "catalog approval must contain an approved reviewer");
    for (const field of ["reviewedAtUtc", "approvedAtUtc"]) {
      if (typeof approval[field] !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(approval[field])) addError(errors, `catalog approval ${field} must be an explicit UTC timestamp`);
    }
    const checklist = approval.reviewChecklist;
    for (const field of ["officialSourceUrlsChecked", "hoursAndAccessChecked", "pricingChecked", "bilingualCopyChecked", "hashesChecked"]) if (checklist?.[field] !== true) addError(errors, `catalog approval reviewChecklist.${field} must be true`);
    if (checklist?.networkFetchAtSeedTime !== false) addError(errors, "catalog approval reviewChecklist.networkFetchAtSeedTime must be false");
  } else if (approvalMode !== "draft") {
    addError(errors, `unsupported catalog approval mode ${approvalMode}`);
  } else if (approval.status !== "draft" || approval.reviewedAtUtc !== null || approval.approvedAtUtc !== null || approval.reviewer?.status !== "pending") addError(errors, "catalog approval must remain draft, unreviewed, and pending");
  if (approval.fixedUuidNamespace !== "6ba7b810-9dad-11d1-80b4-00c04fd430c8" || approval.uuidVersion !== 5) addError(errors, "fixed UUIDv5 namespace/version is required");
  if (JSON.stringify(approval.counts) !== JSON.stringify(EXPECTED_COUNTS)) addError(errors, "approval counts do not match the exact manifest counts");
  if (approval.sourceHashes?.places !== placeHash || approval.sourceHashes?.tours !== tourHash) addError(errors, "approval source hashes do not match manifests");
  if (approval.sourceHashes?.sourceHashes !== canonicalSha256(hashes)) addError(errors, "approval source-hashes digest does not match source-hashes manifest");
  if (!approval.slugRules || approval.slugRules.order !== "manifest array order is semantic and immutable") addError(errors, "approval must pin slug and order rules");

  return { ok: errors.length === 0, errors, counts: { ...EXPECTED_COUNTS }, hashes: { places: placeHash, tours: tourHash } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex >= 0 ? process.argv[rootIndex + 1] : process.cwd();
  const result = checkCatalogBundle({ root });
  if (!result.ok) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Task 14 source approval draft passes (${result.counts.places} places, ${result.counts.tours} tours, ${result.counts.operationalAreas} areas)`);
  }
}
