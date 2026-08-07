/**
 * Supabase Auth identifies accounts by email, but this ERP signs people in by User ID — a
 * student's register number (`9124243011`) or a staff ID (`krithikaa_aids`). Every account is
 * provisioned as `<lowercase-user-id>@<AUTH_EMAIL_DOMAIN>`, and `resolveLoginEmail` rebuilds
 * that address at sign-in.
 *
 * This is a fixed, non-secret routing domain, not a configuration knob: it must match the
 * addresses already stored in auth.users, so a deployment that changed it would simply lock
 * everyone out. Keeping it in source rather than an environment variable means sign-in cannot
 * break because a variable was missed in a new environment.
 *
 * Changing it requires re-provisioning every account — see `supabase/pilot/`.
 */
export const AUTH_EMAIL_DOMAIN = 'login.vernex.in'
