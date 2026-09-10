import type { Locale } from "@/lib/i18n/config";

export type RegistrationInput = { displayName: string; email: string; password: string; passwordConfirmation: string; locale: Locale };
export type RegistrationField = "displayName" | "email" | "password" | "passwordConfirmation";
export type RegistrationErrorCode = "REQUIRED" | "NAME" | "EMAIL" | "PASSWORD" | "MISMATCH" | "EMAIL_EXISTS" | "UNAVAILABLE" | "FAILED" | "SIGNED_IN";
export class RegistrationError extends Error {
  constructor(public readonly code: RegistrationErrorCode) { super(code); this.name = "RegistrationError"; }
}
export function validateRegistration(input: RegistrationInput): Partial<Record<RegistrationField, RegistrationErrorCode>> {
  const errors: Partial<Record<RegistrationField, RegistrationErrorCode>> = {};
  if (!input.displayName.trim()) errors.displayName = "REQUIRED";
  else if (input.displayName.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(input.displayName)) errors.displayName = "NAME";
  if (!input.email.trim()) errors.email = "REQUIRED";
  else if (input.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.email = "EMAIL";
  if (!input.password) errors.password = "REQUIRED";
  else if (input.password.length < 8 || input.password.length > 128 || !/[A-Z]/.test(input.password) || !/[a-z]/.test(input.password) || !/[0-9]/.test(input.password)) errors.password = "PASSWORD";
  if (!input.passwordConfirmation) errors.passwordConfirmation = "REQUIRED";
  else if (input.password !== input.passwordConfirmation) errors.passwordConfirmation = "MISMATCH";
  return errors;
}
export interface RegistrationPort {
  register(input: RegistrationInput): Promise<{ emailConfirmationRequired: boolean }>;
}
