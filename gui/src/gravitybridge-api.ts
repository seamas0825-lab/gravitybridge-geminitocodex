let installed = false;
let sessionToken: string | null = null;
let csrfToken: string | null = null;
let sessionOrigin: string | null = null;
let refreshFlight: Promise<boolean> | null = null;

function takeMeta(name: string): string | null {
  const element = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  const value = element?.content.trim() || null;
  element?.remove();
  return value;
}

function storeSession(token: string | null, csrf: string | null, origin: string | null): boolean {
  if (!token?.startsWith("ocx_session_") || !csrf || origin !== window.location.origin) return false;
  sessionToken = token;
  csrfToken = csrf;
  sessionOrigin = origin;
  return true;
}

function metaFromHtml(html: string, name: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (tag.match(/\bname="([^"]+)"/i)?.[1] !== name) continue;
    return tag.match(/\bcontent="([^"]*)"/i)?.[1]?.trim() || null;
  }
  return null;
}

function withSession(input: RequestInfo | URL, init?: RequestInit): [RequestInfo | URL, RequestInit] {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (sessionToken) headers.set("X-OpenCodex-API-Key", sessionToken);
  if (sessionOrigin) headers.set("X-OpenCodex-GUI-Origin", sessionOrigin);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (csrfToken && method !== "GET" && method !== "HEAD") headers.set("X-OpenCodex-CSRF-Token", csrfToken);
  return [input, { ...init, headers }];
}

export function installGravityBridgeFetch(): void {
  if (installed) return;
  installed = true;
  storeSession(
    takeMeta("opencodex-session-token"),
    takeMeta("opencodex-session-csrf"),
    takeMeta("opencodex-session-origin"),
  );
  const originalFetch = window.fetch.bind(window);

  const refreshSession = () => {
    refreshFlight ??= (async () => {
      const response = await originalFetch("/opencodex-session", { cache: "no-store" });
      if (!response.ok) return false;
      const html = await response.text();
      return storeSession(
        metaFromHtml(html, "opencodex-session-token"),
        metaFromHtml(html, "opencodex-session-csrf"),
        metaFromHtml(html, "opencodex-session-origin"),
      );
    })().catch(() => false).finally(() => { refreshFlight = null; });
    return refreshFlight;
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
      return originalFetch(input, init);
    }
    const [firstInput, firstInit] = withSession(input, init);
    const first = await originalFetch(firstInput, firstInit);
    if (first.status !== 401 || !await refreshSession()) return first;
    const [retryInput, retryInit] = withSession(input, init);
    return originalFetch(retryInput, retryInit);
  };
}
