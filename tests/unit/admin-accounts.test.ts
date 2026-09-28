import { describe, expect, it } from "vitest";
import { createDemoAdminAccountsPort } from "@/lib/infrastructure/demo/admin-accounts";

const valid = { name: "Trần An", email: "new@demo.example", phone: "0901234567", password: "Password123" };

describe("demo admin accounts", () => {
  it("records a password-free immutable creation and lock/unlock audit", async () => {
    const port = createDemoAdminAccountsPort();
    await port.createGuide(valid);
    const created = (await port.list())[0];
    await port.setLocked(created.id, true, "Kiểm tra hồ sơ");
    await port.setLocked(created.id, false);
    const account = (await port.list())[0];
    expect(account.audit?.map(item => item.action)).toEqual(["Tạo tài khoản", "Khóa tài khoản", "Mở khóa tài khoản"]);
    expect(account.audit?.[1].reason).toBe("Kiểm tra hồ sơ");
    expect(account.audit?.every(item => item.id && !Number.isNaN(Date.parse(item.at)))).toBe(true);
    expect(JSON.stringify(account.audit)).not.toContain(valid.password);
    account.audit![1].reason = "changed";
    account.audit!.push({ id: "bad", action: "bad", at: "bad" });
    expect((await port.list())[0].audit).toHaveLength(3);
    expect((await port.list())[0].audit?.[1].reason).toBe("Kiểm tra hồ sơ");
  });
  it("provides isolated synthetic accounts and defensive copies", async () => {
    const port = createDemoAdminAccountsPort();
    const rows = await port.list();
    expect(rows).toHaveLength(30);
    expect(rows.filter(row => row.role === "customer")).toHaveLength(24);
    expect(rows.filter(row => row.role === "guide")).toHaveLength(6);
    expect(rows.filter(row => row.status === "locked")).toHaveLength(5);
    expect(rows.every(row => row.email.endsWith(".example"))).toBe(true);
    rows[0].history.push({ id: "bad", title: "bad", date: "bad", status: "bad" });
    rows[0].name = "mutated";
    expect((await port.list())[0].name).not.toBe("mutated");
    expect((await port.list())[0].history.find(row => row.id === "bad")).toBeUndefined();
    await port.createGuide(valid);
    expect(await createDemoAdminAccountsPort().list()).toHaveLength(30);
  });

  it("creates only an active guide, normalizes input and does not expose password", async () => {
    const port = createDemoAdminAccountsPort();
    await port.createGuide({ ...valid, name: "  Trần An  ", email: " NEW@demo.example " });
    expect((await port.list()).find(row => row.email === valid.email)).toMatchObject({ name: "Trần An", role: "guide", status: "active" });
    expect(JSON.stringify(await port.list())).not.toContain(valid.password);
    await expect(port.createGuide({ ...valid, email: "NEW@demo.example" })).rejects.toMatchObject({ field: "email" });
  });

  it.each([
    ["name", " "], ["email", "bad"], ["phone", "123"], ["password", "1234567"],
  ])("rejects invalid %s without mutation", async (field, value) => {
    const port = createDemoAdminAccountsPort();
    await expect(port.createGuide({ ...valid, [field]: value })).rejects.toMatchObject({ field });
    expect(await port.list()).toHaveLength(30);
  });

  it("requires a reason to lock and permits unlock without losing tour history", async () => {
    const port = createDemoAdminAccountsPort();
    const account = (await port.list())[0];
    await expect(port.setLocked(account.id, true, " ")).rejects.toMatchObject({ field: "reason" });
    await port.setLocked(account.id, true, "  Yêu cầu kiểm tra  ");
    expect((await port.list())[0]).toMatchObject({ status: "locked", lockReason: "Yêu cầu kiểm tra", history: account.history });
    await port.setLocked(account.id, false);
    expect((await port.list())[0]).toMatchObject({ status: "active", history: account.history });
    expect((await port.list())[0].lockReason).toBeUndefined();
    await expect(port.setLocked("missing", true, "reason")).rejects.toThrow("Không tìm thấy tài khoản");
  });
});
