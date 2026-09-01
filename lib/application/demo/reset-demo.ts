import { clearDemoBookingMemoryStorage } from "@/lib/application/booking/mock-booking";

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

function clearMatchingKeys(
  storage: DemoStorageArea,
  matches: (key: string) => boolean,
): boolean {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && matches(key)) keys.push(key);
    }
  } catch {
    return false;
  }
  let complete = true;
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      complete = false;
    }
  }
  return complete;
}

export function clearLocalLensDemoStorage(input: {
  session: DemoStorageArea;
  local: DemoStorageArea;
}): void {
  const sessionComplete = clearMatchingKeys(input.session, (key) => DEMO_SESSION_KEYS.has(key));
  const localComplete = clearMatchingKeys(
    input.local,
    (key) => DEMO_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );
  clearDemoBookingMemoryStorage();
  if (!sessionComplete || !localComplete) {
    throw new Error("LocalLens demo storage reset was incomplete");
  }
}
