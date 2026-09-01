export interface DemoStorageArea {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

const DEMO_SESSION_KEYS = new Set([
  "localens.personalization.v1",
  "localens.custom-request.v1",
  "localens.demo.planner.e2e.v1",
  "localens.portal.demo.v1",
]);

const DEMO_LOCAL_PREFIXES = [
  "locallens.demo.booking.v1:",
] as const;

function matchingKeys(
  storage: DemoStorageArea,
  matches: (key: string) => boolean,
): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && matches(key)) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

function removeSafely(storage: DemoStorageArea, keys: readonly string[]): void {
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      // A blocked browser storage area must not prevent the remaining reset.
    }
  }
}

export function clearLocalLensDemoStorage(input: {
  session: DemoStorageArea;
  local: DemoStorageArea;
}): void {
  const sessionKeys = matchingKeys(input.session, (key) => DEMO_SESSION_KEYS.has(key));
  const localKeys = matchingKeys(input.local, (key) => DEMO_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix)));
  removeSafely(input.session, sessionKeys);
  removeSafely(input.local, localKeys);
}
