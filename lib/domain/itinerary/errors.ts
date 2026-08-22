export type DomainErrorCode =
  | "INVALID_ITINERARY_INPUT"
  | "USD_DISABLED"
  | "NO_FEASIBLE_ITINERARY"
  | "ITINERARY_SEARCH_LIMIT"
  | "INVALID_ITINERARY_RESULT";

export interface DomainError {
  code: DomainErrorCode;
  messageKey: string;
  retryable: boolean;
  issueKeys?: string[];
}

const RETRYABLE_CODES: ReadonlySet<DomainErrorCode> = new Set([
  "ITINERARY_SEARCH_LIMIT",
]);

export function domainError(
  code: DomainErrorCode,
  messageKey: string,
  issueKeys?: string[],
): DomainError {
  return {
    code,
    messageKey,
    retryable: RETRYABLE_CODES.has(code),
    ...(issueKeys && issueKeys.length > 0 ? { issueKeys: [...issueKeys] } : {}),
  };
}
