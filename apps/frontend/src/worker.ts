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
    return env.ASSETS.fetch(request);
  },
};
