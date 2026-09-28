export type AdminAccount = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "customer" | "guide";
  status: "active" | "locked";
  createdAt: string;
  lockReason?: string;
  history: { id: string; title: string; date: string; status: string }[];
  audit?: { id: string; action: string; at: string; reason?: string }[];
};

export type CreateGuideInput = { name: string; email: string; phone: string; password: string };

export interface AdminAccountsPort {
  list(): Promise<AdminAccount[]>;
  createGuide(input: CreateGuideInput): Promise<void>;
  setLocked(id: string, locked: boolean, reason?: string): Promise<void>;
}

export class AdminAccountsError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = "AdminAccountsError";
  }
}
