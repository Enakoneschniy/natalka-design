/** The cabinet answers on its own hosts; the shop answers everywhere else. */
export const DEFAULT_PRO_HOSTS = 'pro.chronika.me';

export function proHosts(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? DEFAULT_PRO_HOSTS)
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True when the request's Host header names a cabinet host. Compared exactly, port included. */
export function isProHost(host: string | null | undefined, raw = process.env.PRO_HOSTS): boolean {
  return Boolean(host) && proHosts(raw).has(String(host).trim().toLowerCase());
}
