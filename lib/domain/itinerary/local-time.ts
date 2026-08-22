import type { Result } from "@/lib/domain/itinerary/contracts";

const HCM_OFFSET_MINUTES = 7 * 60;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MILLISECONDS_PER_MINUTE = 60_000;

const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
      ? 29
      : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function invalidTime(): Result<number> {
  return {
    ok: false,
    error: {
      code: "INVALID_ITINERARY_INPUT",
      messageKey: "itinerary.local_time.invalid",
      retryable: false,
    },
  };
}

export function normalizeToHcmMinute(value: unknown): Result<number> {
  if (typeof value !== "string") return invalidTime();

  const match = timestampPattern.exec(value);
  if (!match) return invalidTime();

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = Number(match[6]);
  const milliseconds = match[7]
    ? Number(match[7].padEnd(3, "0"))
    : 0;

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hours > 23 ||
    minutes > 59 ||
    seconds > 59
  ) {
    return invalidTime();
  }

  let offsetMinutes = 0;
  if (match[8] !== "Z") {
    const offsetHours = Number(match[10]);
    const offsetPartMinutes = Number(match[11]);
    if (offsetHours > 23 || offsetPartMinutes > 59) return invalidTime();
    offsetMinutes = offsetHours * MINUTES_PER_HOUR + offsetPartMinutes;
    if (match[9] === "-") offsetMinutes = -offsetMinutes;
  }

  // Setting the full year explicitly avoids Date.UTC's special handling of
  // years 0 through 99. All calendar validation happened above.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hours, minutes, seconds, milliseconds);
  const epochMilliseconds = date.getTime() - offsetMinutes * 60_000;
  if (!Number.isFinite(epochMilliseconds)) return invalidTime();

  const normalizedEpochMinute = Math.ceil(
    epochMilliseconds / MILLISECONDS_PER_MINUTE,
  );
  if (!isSupportedHcmEpochMinute(normalizedEpochMinute)) return invalidTime();

  return {
    ok: true,
    value: normalizedEpochMinute,
  };
}

export function isSupportedHcmEpochMinute(epochMinute: number): boolean {
  if (!Number.isSafeInteger(epochMinute)) return false;
  const date = new Date(
    epochMinute * MILLISECONDS_PER_MINUTE +
      HCM_OFFSET_MINUTES * MILLISECONDS_PER_MINUTE,
  );
  const year = date.getUTCFullYear();
  return Number.isFinite(date.getTime()) && year >= 0 && year <= 9999;
}

export function formatHcmMinute(epochMinute: number): string {
  if (!Number.isSafeInteger(epochMinute)) {
    throw new RangeError("epoch minute must be a safe integer");
  }

  if (!isSupportedHcmEpochMinute(epochMinute)) {
    throw new RangeError("epoch minute is outside the supported HCMC date range");
  }

  const date = new Date(
    epochMinute * MILLISECONDS_PER_MINUTE +
      HCM_OFFSET_MINUTES * MILLISECONDS_PER_MINUTE,
  );

  const pad = (part: number, width: number) => String(part).padStart(width, "0");
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(
    date.getUTCDate(),
    2,
  )}T${pad(date.getUTCHours(), 2)}:${pad(date.getUTCMinutes(), 2)}:00+07:00`;
}

export { HCM_OFFSET_MINUTES, MINUTES_PER_DAY };
