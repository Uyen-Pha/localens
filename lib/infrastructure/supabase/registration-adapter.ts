import type { SupabaseClient } from "@supabase/supabase-js";
import { RegistrationError, validateRegistration, type RegistrationPort } from "@/lib/application/portal/registration";

// A non-persisting auth client is supplied here. Signup must never replace an existing session.
export function createRegistrationAdapter(client: Pick<SupabaseClient, "auth">): RegistrationPort {
  return { async register(input) {
    if (Object.keys(validateRegistration(input)).length) throw new RegistrationError("FAILED");
    try {
      const result = await client.auth.signUp({
        email: input.email.trim().toLowerCase(), password: input.password,
        options: { data: { display_name: input.displayName.trim(), language: input.locale } },
      });
      if (result.error) {
        if (["user_already_exists", "email_exists"].includes(result.error.code ?? "")) throw new RegistrationError("EMAIL_EXISTS");
        if (result.error.code === "signup_disabled") throw new RegistrationError("UNAVAILABLE");
        throw new RegistrationError("FAILED");
      }
      if (!result.data.user) throw new RegistrationError("FAILED");
      // Auth may return an obfuscated user for a duplicate when email confirmation is enabled.
      if (result.data.user.identities?.length === 0) throw new RegistrationError("EMAIL_EXISTS");
      return { emailConfirmationRequired: result.data.session === null };
    } catch (error) {
      if (error instanceof RegistrationError) throw error;
      throw new RegistrationError("FAILED");
    }
  } };
}
