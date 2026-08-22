import { domainError } from "@/lib/domain/itinerary/errors";
import type {
  OpeningInterval,
  OpeningException,
  PlaceCandidate,
  Result,
} from "@/lib/domain/itinerary/contracts";
import {
  formatHcmMinute,
  normalizeToHcmMinute,
  MINUTES_PER_DAY,
} from "@/lib/domain/itinerary/local-time";

const INVALID_KEY = "itinerary.opening_hours.invalid";
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_SUPPORTED_EPOCH_MINUTE =
  Math.floor(8_640_000_000_000_000 / 60_000) - 7 * 60;

const invalidOpening = <T>(): Result<T> => ({
  ok: false,
  error: domainError("INVALID_ITINERARY_INPUT", INVALID_KEY),
});

function minutesOf(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isValidTimeWindow(window: unknown): window is {
  opensAt: string;
  closesAt: string;
} {
  if (!window || typeof window !== "object") return false;
  const candidate = window as { opensAt?: unknown; closesAt?: unknown };
  return (
    typeof candidate.opensAt === "string" &&
    typeof candidate.closesAt === "string" &&
    timePattern.test(candidate.opensAt) &&
    timePattern.test(candidate.closesAt) &&
    candidate.opensAt !== candidate.closesAt
  );
}

function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = datePattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const days = new Date(0);
  days.setUTCFullYear(year, month, 0);
  const daysInMonth = days.getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

function localDateStart(localDate: string): number | null {
  const result = normalizeToHcmMinute(`${localDate}T00:00:00+07:00`);
  return result.ok ? result.value : null;
}

function weekdayOf(localDate: string): number {
  const match = datePattern.exec(localDate);
  if (!match) return -1;
  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCDay();
}

function previousLocalDate(localDateStartEpochMinute: number): string {
  return formatHcmMinute(localDateStartEpochMinute - MINUTES_PER_DAY).slice(0, 10);
}

function exceptionFor(
  place: PlaceCandidate,
  localDate: string,
): OpeningException | null {
  return (
    place.openingExceptions.find((exception) => exception.localDate === localDate) ??
    null
  );
}

function sourceKey(
  source: "normal" | "exception",
  dateOrWeekday: string | number,
  index: number,
): string {
  return `${source}:${dateOrWeekday}:${index}`;
}

function validatePlace(place: unknown): place is PlaceCandidate {
  if (!place || typeof place !== "object") return false;
  const candidate = place as Partial<PlaceCandidate>;
  if (!Array.isArray(candidate.openingHours) || !Array.isArray(candidate.openingExceptions)) {
    return false;
  }
  for (const window of candidate.openingHours) {
    if (
      !window ||
      typeof window !== "object" ||
      typeof window.weekday !== "number" ||
      !Number.isInteger(window.weekday) ||
      window.weekday < 0 ||
      window.weekday > 6 ||
      !isValidTimeWindow(window)
    ) {
      return false;
    }
  }
  const dates = new Set<string>();
  for (const exception of candidate.openingExceptions) {
    if (
      !exception ||
      typeof exception !== "object" ||
      !isValidCalendarDate(exception.localDate) ||
      dates.has(exception.localDate) ||
      typeof exception.closed !== "boolean" ||
      !Array.isArray(exception.windows) ||
      (exception.closed && exception.windows.length > 0) ||
      exception.windows.some((window) => !isValidTimeWindow(window))
    ) {
      return false;
    }
    dates.add(exception.localDate);
  }
  return true;
}

function hasOverlappingWindows(
  windows: ReadonlyArray<{ opensAt: string; closesAt: string }>,
): boolean {
  const intervals = windows
    .map((window) => {
      const open = minutesOf(window.opensAt);
      const close = minutesOf(window.closesAt);
      return [open, close > open ? close : close + MINUTES_PER_DAY] as const;
    })
    .sort(([left], [right]) => left - right);
  return intervals.some(
    (interval, index) => index > 0 && interval[0] < intervals[index - 1][1],
  );
}

function intervalForWindow(
  dateStartEpochMinute: number,
  window: { opensAt: string; closesAt: string },
  key: string,
): OpeningInterval {
  const opensAt = minutesOf(window.opensAt);
  const closesAt = minutesOf(window.closesAt);
  const endOffset = closesAt > opensAt ? closesAt : closesAt + MINUTES_PER_DAY;
  return {
    startEpochMinute: dateStartEpochMinute + opensAt,
    // A window that crosses midnight is emitted as a fragment for its
    // starting date. The carry-over fragment is produced for the next date.
    endEpochMinute: dateStartEpochMinute + Math.min(endOffset, MINUTES_PER_DAY),
    sourceWindowKey: key,
  };
}

function carryIntervalForWindow(
  dateStartEpochMinute: number,
  window: { opensAt: string; closesAt: string },
  key: string,
): OpeningInterval | null {
  const opensAt = minutesOf(window.opensAt);
  const closesAt = minutesOf(window.closesAt);
  if (closesAt >= opensAt) return null;
  return {
    startEpochMinute: dateStartEpochMinute,
    endEpochMinute: dateStartEpochMinute + closesAt,
    sourceWindowKey: key,
  };
}

export function getOpeningIntervals(
  place: PlaceCandidate,
  localDate: string,
): Result<OpeningInterval[]> {
  if (!validatePlace(place) || !isValidCalendarDate(localDate)) {
    return invalidOpening();
  }

  const dateStartEpochMinute = localDateStart(localDate);
  if (dateStartEpochMinute === null) return invalidOpening();
  const weekday = weekdayOf(localDate);
  if (weekday < 0) return invalidOpening();

  const exception = exceptionFor(place, localDate);
  if (exception !== null) {
    if (exception.closed) return { ok: true, value: [] };
    if (hasOverlappingWindows(exception.windows)) return invalidOpening();
    return {
      ok: true,
      value: exception.windows.map((window, index) =>
        intervalForWindow(
          dateStartEpochMinute,
          window,
          sourceKey("exception", localDate, index),
        ),
      ),
    };
  }

  const intervals: OpeningInterval[] = [];
  const normalWindows = place.openingHours.filter(
    (window) => window.weekday === weekday,
  );
  if (hasOverlappingWindows(normalWindows)) return invalidOpening();
  for (const [index, window] of place.openingHours.entries()) {
    if (window.weekday !== weekday) continue;
    intervals.push(
      intervalForWindow(
        dateStartEpochMinute,
        window,
        sourceKey("normal", window.weekday, index),
      ),
    );
  }

  const previousDate = previousLocalDate(dateStartEpochMinute);
  const previousException = exceptionFor(place, previousDate);
  if (previousException === null || !previousException.closed) {
    if (previousException !== null) {
      if (hasOverlappingWindows(previousException.windows)) return invalidOpening();
      for (const [index, window] of previousException.windows.entries()) {
        const carry = carryIntervalForWindow(
          dateStartEpochMinute,
          window,
          sourceKey("exception", previousDate, index),
        );
        if (carry !== null) intervals.push(carry);
      }
    } else {
      const previousWeekday = weekdayOf(previousDate);
      const previousWindows = place.openingHours.filter(
        (window) => window.weekday === previousWeekday,
      );
      if (hasOverlappingWindows(previousWindows)) return invalidOpening();
      for (const [index, window] of place.openingHours.entries()) {
        if (window.weekday !== previousWeekday) continue;
        const carry = carryIntervalForWindow(
          dateStartEpochMinute,
          window,
          sourceKey("normal", window.weekday, index),
        );
        if (carry !== null) intervals.push(carry);
      }
    }
  }

  intervals.sort((left, right) => left.startEpochMinute - right.startEpochMinute);
  return { ok: true, value: intervals };
}

export function findEarliestVisitStart(
  place: PlaceCandidate,
  earliestEpochMinute: number,
  latestEndEpochMinute: number,
  durationMinutes: number,
): Result<number | null> {
  if (
    !validatePlace(place) ||
    !Number.isSafeInteger(earliestEpochMinute) ||
    !Number.isSafeInteger(latestEndEpochMinute) ||
    !Number.isSafeInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    Math.abs(earliestEpochMinute) > MAX_SUPPORTED_EPOCH_MINUTE ||
    Math.abs(latestEndEpochMinute) > MAX_SUPPORTED_EPOCH_MINUTE
  ) {
    return invalidOpening();
  }
  if (latestEndEpochMinute < earliestEpochMinute) {
    return { ok: true, value: null };
  }

  const firstDate = formatHcmMinute(earliestEpochMinute).slice(0, 10);
  const firstDateStart = localDateStart(firstDate);
  if (firstDateStart === null) return invalidOpening();

  const merged: OpeningInterval[] = [];
  for (
    let dateStartEpochMinute = firstDateStart;
    dateStartEpochMinute <= latestEndEpochMinute;
    dateStartEpochMinute += MINUTES_PER_DAY
  ) {
    const date = formatHcmMinute(dateStartEpochMinute).slice(0, 10);
    const intervalsResult = getOpeningIntervals(place, date);
    if (!intervalsResult.ok) return intervalsResult;

    for (const interval of intervalsResult.value) {
      const previous = merged[merged.length - 1];
      if (
        previous &&
        previous.endEpochMinute === interval.startEpochMinute &&
        previous.sourceWindowKey === interval.sourceWindowKey
      ) {
        previous.endEpochMinute = interval.endEpochMinute;
      } else {
        merged.push({ ...interval });
      }
    }

    for (const interval of merged) {
      const candidate = Math.max(earliestEpochMinute, interval.startEpochMinute);
      if (
        candidate + durationMinutes <= interval.endEpochMinute &&
        candidate + durationMinutes <= latestEndEpochMinute
      ) {
        return { ok: true, value: candidate };
      }
    }
  }

  return { ok: true, value: null };
}
