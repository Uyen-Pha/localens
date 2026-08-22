import {
  domainError,
  type DomainError,
} from "@/lib/domain/itinerary/errors";
import type {
  FxSnapshot,
  ItineraryRequest,
  Result,
} from "@/lib/domain/itinerary/contracts";

export type FxRate = { numerator: bigint; denominator: bigint };

const HUNDRED = BigInt("100");
const ONE = BigInt("1");
const ZERO = BigInt("0");
const FX_MAX_AGE_MS = 168 * 60 * 60 * 1000;
const DECIMAL_RATE_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const CANONICAL_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function invalidMoney(): { ok: false; error: DomainError } {
  return {
    ok: false,
    error: domainError("INVALID_ITINERARY_INPUT", "itinerary.money.invalid"),
  };
}

function usdDisabled(): { ok: false; error: DomainError } {
  return {
    ok: false,
    error: domainError("USD_DISABLED", "itinerary.usd_disabled"),
  };
}

function isSafeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function toSafeNumber(value: bigint): Result<number> {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    return invalidMoney();
  }
  return { ok: true, value: numberValue };
}

function isFxRate(value: unknown): value is FxRate {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { numerator?: unknown; denominator?: unknown };
  return (
    typeof candidate.numerator === "bigint" &&
    typeof candidate.denominator === "bigint" &&
    candidate.numerator > ZERO &&
    candidate.denominator > ZERO
  );
}

function isCanonicalUtc(value: unknown): value is string {
  return (
    typeof value === "string" &&
    CANONICAL_UTC_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

export function multiplyVnd(a: number, b: number): Result<number> {
  if (!isSafeNonNegativeInteger(a) || !isSafeNonNegativeInteger(b)) {
    return invalidMoney();
  }
  return toSafeNumber(BigInt(a) * BigInt(b));
}

export function sumVnd(values: readonly number[]): Result<number> {
  if (!Array.isArray(values)) return invalidMoney();

  let total = ZERO;
  for (const value of values) {
    if (!isSafeNonNegativeInteger(value)) return invalidMoney();
    total += BigInt(value);
  }
  return toSafeNumber(total);
}

export function parseFxRate(value: string): Result<FxRate> {
  if (typeof value !== "string" || !DECIMAL_RATE_PATTERN.test(value)) {
    return invalidMoney();
  }

  const [whole, fraction = ""] = value.split(".");
  const digits = `${whole}${fraction}`;
  const numerator = BigInt(digits);
  if (numerator <= ZERO) return invalidMoney();

  const denominator = BigInt(`1${"0".repeat(fraction.length)}`);
  return { ok: true, value: { numerator, denominator } };
}

export function usdCentsToVndFloor(
  cents: number,
  rate: FxRate,
): Result<number> {
  if (!isSafeNonNegativeInteger(cents) || !isFxRate(rate)) {
    return invalidMoney();
  }

  const numerator = BigInt(cents) * rate.numerator;
  const denominator = HUNDRED * rate.denominator;
  return toSafeNumber(numerator / denominator);
}

export function vndToUsdCentsCeil(
  vnd: number,
  rate: FxRate,
): Result<number> {
  if (!isSafeNonNegativeInteger(vnd) || !isFxRate(rate)) {
    return invalidMoney();
  }

  const numerator = BigInt(vnd) * HUNDRED * rate.denominator;
  const denominator = rate.numerator;
  const roundedUp = (numerator + denominator - ONE) / denominator;
  return toSafeNumber(roundedUp);
}

export function normalizeBudgetToVnd(
  request: ItineraryRequest,
  fx: FxSnapshot | undefined,
  asOfUtc: string,
): Result<{ budgetVnd: number; fxSnapshotId: string | null }> {
  if (
    typeof request !== "object" ||
    request === null ||
    typeof request.budget !== "object" ||
    request.budget === null ||
    !isSafeNonNegativeInteger(request.budget.amountMinor)
  ) {
    return invalidMoney();
  }

  if (request.budget.currency === "VND") {
    return {
      ok: true,
      value: { budgetVnd: request.budget.amountMinor, fxSnapshotId: null },
    };
  }
  if (request.budget.currency !== "USD") return invalidMoney();

  if (fx === undefined) return usdDisabled();
  if (
    typeof fx !== "object" ||
    fx === null ||
    !isCanonicalUtc(asOfUtc) ||
    !isCanonicalUtc(fx.observedAtUtc)
  ) {
    return invalidMoney();
  }

  const asOfMs = Date.parse(asOfUtc);
  const observedMs = Date.parse(fx.observedAtUtc);
  if (asOfMs < observedMs) return invalidMoney();
  if (asOfMs - observedMs > FX_MAX_AGE_MS) return usdDisabled();

  const parsedRate = parseFxRate(fx.vndPerUsd);
  if (!parsedRate.ok) return parsedRate;

  const converted = usdCentsToVndFloor(
    request.budget.amountMinor,
    parsedRate.value,
  );
  if (!converted.ok) return converted;

  return {
    ok: true,
    value: { budgetVnd: converted.value, fxSnapshotId: fx.id },
  };
}
