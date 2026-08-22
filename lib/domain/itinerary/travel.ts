import {
  travelEdgeSchema,
  travelSnapshotSchema,
  type Result,
  type TravelEdge,
  type TravelSnapshot,
} from "@/lib/domain/itinerary/contracts";
import { domainError } from "@/lib/domain/itinerary/errors";

export type TravelIndex = ReadonlyMap<
  string,
  ReadonlyMap<string, TravelEdge>
>;

class ImmutableReadonlyMap<K, V> implements ReadonlyMap<K, V> {
  #backing: Map<K, V>;

  public constructor(entries: readonly (readonly [K, V])[]) {
    this.#backing = new Map(entries);
    Object.freeze(this);
  }

  public get size(): number {
    return this.#backing.size;
  }

  public get(key: K): V | undefined {
    return this.#backing.get(key);
  }

  public has(key: K): boolean {
    return this.#backing.has(key);
  }

  public forEach(
    callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
    thisArg?: unknown,
  ): void {
    this.#backing.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }

  public entries(): MapIterator<[K, V]> {
    return this.#backing.entries();
  }

  public keys(): MapIterator<K> {
    return this.#backing.keys();
  }

  public values(): MapIterator<V> {
    return this.#backing.values();
  }

  public [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#backing[Symbol.iterator]();
  }
}

const invalidTravel = <T>(messageKey: string, issueKeys?: string[]): Result<T> => ({
  ok: false,
  error: domainError("INVALID_ITINERARY_INPUT", messageKey, issueKeys),
});

export function indexTravelSnapshot(
  snapshot: TravelSnapshot,
): Result<TravelIndex> {
  const candidate = snapshot as unknown;
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    !Array.isArray((candidate as { edges?: unknown }).edges)
  ) {
    return invalidTravel("itinerary.travel.invalid", ["travel.edges"]);
  }

  const edges = (candidate as { edges: unknown[] }).edges;
  const normalizedEdges: TravelEdge[] = [];
  for (const edge of edges) {
    const parsedEdge = travelEdgeSchema.safeParse(edge);
    if (!parsedEdge.success) {
      return invalidTravel("itinerary.travel.invalid", ["travel.edges"]);
    }
    normalizedEdges.push(parsedEdge.data);
  }

  const destinationsByOrigin = new Map<string, Set<string>>();
  for (const edge of normalizedEdges) {
    let destinations = destinationsByOrigin.get(edge.fromPlaceId);
    if (!destinations) {
      destinations = new Set<string>();
      destinationsByOrigin.set(edge.fromPlaceId, destinations);
    }
    if (destinations.has(edge.toPlaceId)) {
      return invalidTravel("itinerary.travel.duplicate_edge", ["travel.edges"]);
    }
    destinations.add(edge.toPlaceId);
  }

  const parsed = travelSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    return invalidTravel("itinerary.travel.invalid", ["travel.edges"]);
  }

  const outgoing = new Map<string, Map<string, TravelEdge>>();
  for (const edge of parsed.data.edges) {
    let destinations = outgoing.get(edge.fromPlaceId);
    if (!destinations) {
      destinations = new Map();
      outgoing.set(edge.fromPlaceId, destinations);
    }

    destinations.set(
      edge.toPlaceId,
      Object.freeze({ ...edge }),
    );
  }

  const immutableOutgoing: Array<readonly [string, ReadonlyMap<string, TravelEdge>]> =
    [...outgoing].map(([fromPlaceId, destinations]) => [
      fromPlaceId,
      new ImmutableReadonlyMap([...destinations]),
    ]);

  return { ok: true, value: new ImmutableReadonlyMap(immutableOutgoing) };
}

export function getTransition(
  index: TravelIndex,
  fromId: string,
  toId: string,
): TravelEdge | null {
  return index.get(fromId)?.get(toId) ?? null;
}

export function toScheduledTransition(edge: TravelEdge): {
  travelMinutes: number;
  bufferMinutes: 10;
  groupCostVnd: number;
} {
  return {
    travelMinutes: edge.minutes,
    bufferMinutes: 10,
    groupCostVnd: edge.groupCostVnd,
  };
}
