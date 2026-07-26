/** Some PaaS dashboards (confirmed: Back4app) store env var values with
 * surrounding whitespace or literal quote characters when typed/pasted into
 * their UI, even though the displayed value looks clean. This has broken
 * both PORT (Number.parseInt) and JWT expiresIn (ms()) parsing in
 * production while working fine locally — sanitize at the read site. */
export function cleanEnv(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '');
}
