/**
 * The sign-in methods this deployment actually offers, in display order.
 *
 * Each entry is one button (or, later, one form) on the auth screens. Adding a
 * provider is a new union member plus its branch below — e.g.
 * `{ id: "microsoft" }` once a Microsoft client is configured, or
 * `{ id: "sso" }` (company email → domain-matched IdP) once @better-auth/sso is
 * installed. Only configured methods are returned: the screens never show a
 * disabled or "coming soon" option.
 */
export type SignInMethod = { id: "google" };

export type SignInMethodId = SignInMethod["id"];

export function signInMethods(): SignInMethod[] {
  const methods: SignInMethod[] = [];
  // Read per request: on Workers the secret only exists at runtime, never at build.
  if (process.env.GOOGLE_CLIENT_ID) methods.push({ id: "google" });
  return methods;
}
