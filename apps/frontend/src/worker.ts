// Frontend Worker: serves the SPA (ASSETS) and proxies /api/* to the backend Worker via a
// Service Binding — so the browser sees ONE origin (first-party cookies, no CORS). ADR-0005.
// (Local dev uses a Vite proxy instead — see vite.config.ts.)

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
interface FrontendEnv {
  ASSETS: Fetcher;
  BACKEND: Fetcher;
}

export default {
  async fetch(request: Request, env: FrontendEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return env.BACKEND.fetch(request);
    }
    // Self-hosted fonts are content-stable → long immutable cache.
    if (url.pathname.startsWith("/fonts/")) {
      const res = await env.ASSETS.fetch(request);
      const cached = new Response(res.body, res);
      cached.headers.set("cache-control", "public, max-age=31536000, immutable");
      return cached;
    }
    return env.ASSETS.fetch(request);
  },
};
