import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { checkCatalogBundle, canonicalSha256 } from "./source-approval.mjs";

export const SEED_READINESS_CODES = Object.freeze({
  APPROVAL_NOT_READY: "APPROVAL_NOT_READY",
  SOURCE_BUNDLE_NOT_READY: "SOURCE_BUNDLE_NOT_READY",
  CATALOG_NOT_SELLABLE: "CATALOG_NOT_SELLABLE",
  SUPPORT_NOT_RUNTIME_READY: "SUPPORT_NOT_RUNTIME_READY",
  TOURS_NOT_AVAILABLE: "TOURS_NOT_AVAILABLE",
  FX_NOT_SAFE: "FX_NOT_SAFE",
});

const EXPECTED_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const EXPECTED_COUNTS = Object.freeze({ operationalAreas: 4, places: 30, tours: 8 });
const APPROVAL_FILE = join("data", "approvals", "hcmc-catalog.v1.json");
const PLACE_FILE = join("data", "sources", "hcmc-places.v1.json");
const TOUR_FILE = join("data", "sources", "hcmc-tours.v1.json");
const HASH_FILE = join("data", "sources", "source-hashes.v1.json");

function issue(code, message, details = []) {
  return Object.freeze({ code, message, details: Object.freeze([...details]) });
}

function readJson(root, relativePath) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(join(root, relativePath), "utf8")) };
  } catch (error) {
    return { ok: false, error: `${relativePath}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function isUtcTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value.slice(0, 19));
}

function approvalShapeIsReady(approval, places, tours, hashes) {
  const errors = [];
  if (approval?.status !== "approved") errors.push("status must be approved");
  if (approval?.reviewer?.status !== "approved" || typeof approval?.reviewer?.name !== "string" || !approval.reviewer.name.trim() || typeof approval?.reviewer?.userId !== "string" || !approval.reviewer.userId.trim()) errors.push("reviewer must be approved with name and userId");
  for (const field of ["reviewedAtUtc", "approvedAtUtc"]) if (!isUtcTimestamp(approval?.[field])) errors.push(`${field} must be an explicit UTC timestamp`);
  if (approval?.fixedUuidNamespace !== EXPECTED_NAMESPACE || approval?.uuidVersion !== 5) errors.push("fixed UUIDv5 namespace/version is invalid");
  const checklist = approval?.reviewChecklist;
  for (const field of ["officialSourceUrlsChecked", "hoursAndAccessChecked", "pricingChecked", "bilingualCopyChecked", "hashesChecked"]) if (checklist?.[field] !== true) errors.push(`reviewChecklist.${field} must be true before seeding`);
  if (checklist?.networkFetchAtSeedTime !== false) errors.push("reviewChecklist.networkFetchAtSeedTime must remain false");
  if (isUtcTimestamp(approval?.reviewedAtUtc) && isUtcTimestamp(approval?.approvedAtUtc) && new Date(approval.approvedAtUtc).getTime() < new Date(approval.reviewedAtUtc).getTime()) errors.push("approvedAtUtc cannot precede reviewedAtUtc");
  if (JSON.stringify(approval?.counts) !== JSON.stringify(EXPECTED_COUNTS)) errors.push("approval counts do not match the required 4/30/8 counts");
  if (JSON.stringify(places?.operationalAreas?.length) !== JSON.stringify(EXPECTED_COUNTS.operationalAreas) || JSON.stringify(places?.places?.length) !== JSON.stringify(EXPECTED_COUNTS.places) || JSON.stringify(tours?.tours?.length) !== JSON.stringify(EXPECTED_COUNTS.tours)) errors.push("source manifest counts do not match the required 4/30/8 counts");
  if (approval?.sourceHashes?.places !== canonicalSha256(places)) errors.push("approval places hash does not match the checked-in manifest");
  if (approval?.sourceHashes?.tours !== canonicalSha256(tours)) errors.push("approval tours hash does not match the checked-in manifest");
  if (approval?.sourceHashes?.sourceHashes !== canonicalSha256(hashes)) errors.push("approval source-hashes digest does not match the checked-in hash manifest");
  if (approval?.slugRules?.order !== "manifest array order is semantic and immutable") errors.push("approval must pin immutable manifest order");
  if (approval?.slugRules?.placeIdRule !== "UUIDv5(namespace, place slug)" || approval?.slugRules?.tourIdRule !== "UUIDv5(namespace, tour slug)") errors.push("approval must pin place/tour UUIDv5 rules");
  return errors;
}

function runtimeSupportReady(place) {
  for (const kind of ["dietary", "mobility"]) {
    const value = place?.support?.[kind];
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const entries = Object.entries(value).filter(([requirement]) => requirement !== "confidence" && requirement !== "sourceRef");
    if (entries.length === 0) return false;
    if (entries.some(([requirement, status]) => !/^.{1,80}$/.test(requirement) || !["supported", "unsupported", "unknown"].includes(status))) return false;
  }
  return true;
}

function checkCatalogRuntime(places, tours) {
  const catalogProblems = [];
  const supportProblems = [];
  if (places?.researchOnly === true) catalogProblems.push("places manifest is still marked researchOnly");
  for (const place of places?.places ?? []) {
    if (place.status !== "sellable") catalogProblems.push(`${place.slug}: status=${place.status}`);
    if (place.hours?.status !== "known" || !Array.isArray(place.hours.windows) || place.hours.windows.length === 0) catalogProblems.push(`${place.slug}: opening hours are not runtime-known`);
    if (!runtimeSupportReady(place)) supportProblems.push(`${place.slug}: dietary/mobility support lacks requirement/status rows`);
  }
  const tourProblems = [];
  const bySlug = new Map((places?.places ?? []).map((place) => [place.slug, place]));
  if (tours?.researchOnly === true) tourProblems.push("tours manifest is still marked researchOnly");
  for (const tour of tours?.tours ?? []) {
    const unavailableStops = (tour.stops ?? []).filter((slug) => bySlug.get(slug)?.status !== "sellable");
    if (tour.available !== true || unavailableStops.length > 0) tourProblems.push(`${tour.slug}: available=${String(tour.available)}, unavailableStops=${unavailableStops.join(",") || "none"}`);
  }
  return { catalogProblems, supportProblems, tourProblems };
}

function checkFx(tours) {
  const fx = tours?.demoFx;
  const policy = tours?.currencyPolicy;
  const problems = [];
  if (fx?.environment !== "demo" || fx?.status !== "stale" || fx?.usdEnabled !== false || typeof fx?.staleReason !== "string" || !fx.staleReason.trim()) problems.push("demo FX must be stale, explicitly demo, and USD-disabled");
  if (policy?.baseCurrency !== "VND" || policy?.usdEnabled !== false || typeof policy?.usdDisabledReason !== "string" || !policy.usdDisabledReason.trim()) problems.push("currency policy must use VND and disable USD while FX is stale");
  if (typeof fx?.vndPerUsd !== "string" || !/^\d+(?:\.\d{1,8})?$/.test(fx.vndPerUsd) || Number(fx.vndPerUsd) <= 0) problems.push("demo FX rate must be a positive canonical decimal string");
  if (!isUtcTimestamp(fx?.observedAtUtc)) problems.push("demo FX observedAtUtc must be an explicit UTC timestamp");
  return problems;
}

/**
 * Validates whether the checked-in researched manifests are allowed to reach
 * a future deterministic SQL renderer. This function deliberately performs
 * no writes, no approval mutation, and no network access.
 */
export function assessSeedReadiness({ root = process.cwd() } = {}) {
  const resolvedRoot = resolve(root);
  const approvalResult = readJson(resolvedRoot, APPROVAL_FILE);
  const placesResult = readJson(resolvedRoot, PLACE_FILE);
  const toursResult = readJson(resolvedRoot, TOUR_FILE);
  const hashesResult = readJson(resolvedRoot, HASH_FILE);
  const readErrors = [approvalResult, placesResult, toursResult, hashesResult].filter((result) => !result.ok).map((result) => result.error);
  if (readErrors.length > 0) return { ok: false, issues: [issue(SEED_READINESS_CODES.APPROVAL_NOT_READY, "Task 15 cannot read the complete approval/source bundle", readErrors)] };

  const approval = approvalResult.value;
  const places = placesResult.value;
  const tours = toursResult.value;
  const hashes = hashesResult.value;
  const approvalErrors = approvalShapeIsReady(approval, places, tours, hashes);
  const issues = [];
  if (approvalErrors.length > 0) issues.push(issue(SEED_READINESS_CODES.APPROVAL_NOT_READY, "Human approval is required before deterministic seed generation", approvalErrors));

  const sourceBundle = checkCatalogBundle({ root: resolvedRoot, approvalMode: approval?.status === "approved" ? "approved" : "draft" });
  if (!sourceBundle.ok) issues.push(issue(SEED_READINESS_CODES.SOURCE_BUNDLE_NOT_READY, "The source bundle failed its source/provenance gate", sourceBundle.errors));

  const runtime = checkCatalogRuntime(places, tours);
  if (runtime.catalogProblems.length > 0) issues.push(issue(SEED_READINESS_CODES.CATALOG_NOT_SELLABLE, "Every published place must be sellable with known opening hours", runtime.catalogProblems));
  if (runtime.supportProblems.length > 0) issues.push(issue(SEED_READINESS_CODES.SUPPORT_NOT_RUNTIME_READY, "Dietary and mobility support must be explicit runtime requirement/status maps", runtime.supportProblems));
  if (runtime.tourProblems.length > 0) issues.push(issue(SEED_READINESS_CODES.TOURS_NOT_AVAILABLE, "Every fixed tour and every stop must be available for publication", runtime.tourProblems));
  const fxProblems = checkFx(tours);
  if (fxProblems.length > 0) issues.push(issue(SEED_READINESS_CODES.FX_NOT_SAFE, "Stale demo FX must keep USD disabled", fxProblems));
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, counts: { ...EXPECTED_COUNTS }, approval: { status: "approved", namespace: EXPECTED_NAMESPACE }, writesSeed: false };
}

export function assertSeedReadiness(options) {
  const result = assessSeedReadiness(options);
  if (!result.ok) {
    const error = new Error(result.issues[0].message);
    error.name = "SeedReadinessError";
    error.code = result.issues[0].code;
    error.issues = result.issues;
    throw error;
  }
  return result;
}

function parseArgs(argv) {
  const rootIndex = argv.indexOf("--root");
  return { root: rootIndex >= 0 ? argv[rootIndex + 1] : process.cwd() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = assessSeedReadiness(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
