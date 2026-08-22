import { domainError } from "@/lib/domain/itinerary/errors";
import type {
  OpeningInterval,
  OpeningException,
  PlaceCandidate,
  Result,
} from "@/lib/domain/itinerary/contracts";
import { placeCandidateSchema } from "@/lib/domain/itinerary/contracts";
import {
  formatHcmMinute,
  isSupportedHcmEpochMinute,
  normalizeToHcmMinute,
  MINUTES_PER_DAY,
} from "@/lib/domain/itinerary/local-time";

const INVALID_KEY = "itinerary.opening_hours.invalid";
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

const invalidOpening = <T>(): Result<T> => ({
  ok: false,
  error: domainError("INVALID_ITINERARY_INPUT", INVALID_KEY),
});

function minutesOf(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
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

function previousLocalDate(localDateStartEpochMinute: number): string | null {
  const previousEpochMinute = localDateStartEpochMinute - MINUTES_PER_DAY;
  return isSupportedHcmEpochMinute(previousEpochMinute)
    ? formatHcmMinute(previousEpochMinute).slice(0, 10)
    : null;
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
  return placeCandidateSchema.safeParse(place).success;
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
  if (closesAt >= opensAt || closesAt === 0) {
    return null;
  }
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
      value: exception.windows
        .map((window, index) =>
          intervalForWindow(
            dateStartEpochMinute,
            window,
            sourceKey("exception", localDate, index),
          ),
        )
        .filter(
          (interval) => interval.startEpochMinute < interval.endEpochMinute,
        )
        .sort(compareOpeningIntervals),
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
  const previousException =
    previousDate === null ? null : exceptionFor(place, previousDate);
  if (previousDate !== null && (previousException === null || !previousException.closed)) {
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

  intervals.sort(compareOpeningIntervals);
  return { ok: true, value: intervals };
}

function compareOpeningIntervals(
  left: OpeningInterval,
  right: OpeningInterval,
): number {
  const sourceOrder =
    left.sourceWindowKey < right.sourceWindowKey
      ? -1
      : left.sourceWindowKey > right.sourceWindowKey
        ? 1
        : 0;
  return (
    left.startEpochMinute - right.startEpochMinute ||
    left.endEpochMinute - right.endEpochMinute ||
    sourceOrder
  );
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
    durationMinutes > 720 ||
    latestEndEpochMinute < earliestEpochMinute ||
    latestEndEpochMinute - earliestEpochMinute > 720 ||
    !isSupportedHcmEpochMinute(earliestEpochMinute) ||
    !isSupportedHcmEpochMinute(latestEndEpochMinute)
  ) {
    return invalidOpening();
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
