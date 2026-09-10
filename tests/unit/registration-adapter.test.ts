import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRegistrationAdapter } from "@/lib/infrastructure/supabase/registration-adapter";
import { validateRegistration } from "@/lib/application/portal/registration";

const input = { displayName: " Traveler ", email: "User@Example.test ", password: "Abcdefg1", passwordConfirmation: "Abcdefg1", locale: "vi" as const };
it("normalizes email and name without forwarding confirmation or a role", async () => {
  const signUp = vi.fn().mockResolvedValue({ error: null, data: { user: { identities: [{}] }, session: {} } });
  const port = createRegistrationAdapter({ auth: { signUp } } as unknown as Pick<SupabaseClient, "auth">);
  await expect(port.register(input)).resolves.toEqual({ emailConfirmationRequired: false });
  expect(signUp).toHaveBeenCalledWith({ email: "user@example.test", password: "Abcdefg1", options: { data: { display_name: "Traveler", language: "vi" } } });
});
it.each(["email_exists", "user_already_exists"])("maps duplicate %s without exposing backend details", async code => {
  const port = createRegistrationAdapter({ auth: { signUp: vi.fn().mockResolvedValue({ error: { code }, data: {} }) } } as unknown as Pick<SupabaseClient, "auth">);
  await expect(port.register(input)).rejects.toMatchObject({ code: "EMAIL_EXISTS" });
});
it.each(["abcdefgh", "ABCDEFG1", "abcdefg1", "Abcdefgh", "Ab1"])("rejects weak password %s", password => {
  expect(validateRegistration({ ...input, password, passwordConfirmation: password }).password).toBe("PASSWORD");
});
