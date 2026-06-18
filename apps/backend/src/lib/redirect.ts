/**
 * Open-redirect guard (T020): only allow same-origin **relative** paths as redirect targets.
 * Rejects absolute URLs and protocol-relative (`//host`) values.
 */
export function safeRedirectPath(path: string | null | undefined, fallback = "/"): string {
  if (!path) return fallback;
  // Must start with a single "/" and not "//" (protocol-relative) or contain a scheme.
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (/^\/\\/.test(path)) return fallback; // "/\" tricks
  return path;
}
