export type AdminPlace = {
  id: string;
  name: string;
  category: string;
  area: string;
  address: string;
  hours: string;
  duration: number;
  cost: number | null;
  description: string;
  imageUrl: string;
  sourceUrl: string;
  verifiedAt: string;
  sourceNote: string;
  status: "draft" | "published" | "archived";
};

export type AdminPlaceInput = Omit<AdminPlace, "id" | "status">;

export interface AdminPlacesPort {
  list(): Promise<AdminPlace[]>;
  save(input: AdminPlaceInput, id?: string): Promise<void>;
  setStatus(id: string, status: "published" | "archived"): Promise<void>;
}

export class AdminPlaceError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = "AdminPlaceError";
  }
}
