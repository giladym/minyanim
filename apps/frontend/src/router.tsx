import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Link, Outlet, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Home } from "./routes/home";
import { authClient } from "./lib/auth-client";

/** Shown for any unmatched route (TanStack's default is bare "Not Found" text). */
function NotFound() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center font-sans text-ink">
      <h1 className="text-2xl font-extrabold">{t("notFound.title")}</h1>
      <p className="text-muted">{t("notFound.body")}</p>
      <code dir="ltr" className="rounded-lg bg-chip px-3 py-1.5 text-sm">{window.location.pathname}</code>
      <Link to="/" className="font-bold text-clay">{t("notFound.home")}</Link>
    </main>
  );
}

// Homepage is eager (prerendered entry); auth/shell/profile are code-split into their own
// chunks so they don't bloat the initial homepage download (T056).
const lazyAuth = (name: "SignIn" | "Register" | "ForgotPassword" | "ResetPassword" | "VerifyEmail") =>
  lazyRouteComponent(() => import("./features/auth/AuthScreens"), name);

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  validateSearch: (s): { redirect?: string } => ({ redirect: typeof s.redirect === "string" ? s.redirect : undefined }),
  component: lazyAuth("SignIn"),
});
const registerRoute = createRoute({ getParentRoute: () => rootRoute, path: "/register", component: lazyAuth("Register") });
const forgotRoute = createRoute({ getParentRoute: () => rootRoute, path: "/forgot-password", component: lazyAuth("ForgotPassword") });
const resetRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reset-password", component: lazyAuth("ResetPassword") });
const verifyRoute = createRoute({ getParentRoute: () => rootRoute, path: "/verify-email", component: lazyAuth("VerifyEmail") });

// Authenticated layout: guard + app shell (both code-split).
const authedLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "authed",
  beforeLoad: async ({ location }) => {
    const { data } = await authClient.getSession();
    if (!data) throw redirect({ to: "/sign-in", search: { redirect: location.pathname } });
  },
  component: lazyRouteComponent(() => import("./components/AppShell"), "AppShell"),
});

// Stays (feature 002): dashboard + create + edit, all under the authed layout.
const staysRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: "/stays",
  // The dashboard reads `highlight` (just-saved card id) and `flash` ("saved"|"updated") to
  // briefly surface a confirmation after a create/edit redirect (FR-012).
  validateSearch: (
    s,
  ): { highlight?: string; flash?: "saved" | "updated"; folder?: string; sort?: "date" | "folder" } => ({
    highlight: typeof s.highlight === "string" ? s.highlight : undefined,
    flash: s.flash === "saved" || s.flash === "updated" ? s.flash : undefined,
    folder: typeof s.folder === "string" ? s.folder : undefined,
    sort: s.sort === "date" || s.sort === "folder" ? s.sort : undefined,
  }),
  component: lazyRouteComponent(() => import("./features/stays/StaysDashboard"), "StaysDashboard"),
});
const staysHistoryRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: "/stays/history",
  component: lazyRouteComponent(() => import("./features/stays/HistoryPage"), "HistoryPage"),
});
const staysNewRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: "/stays/new",
  // Optional ?from=<stayId> opens the Add form pre-filled from a source Stay (004 D9 duplicate).
  validateSearch: (s): { from?: string } => ({
    from: typeof s.from === "string" ? s.from : undefined,
  }),
  component: lazyRouteComponent(() => import("./features/stays/AddEditStayForm"), "AddStayPage"),
});
const staysEditRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: "/stays/$id/edit",
  component: lazyRouteComponent(() => import("./features/stays/AddEditStayForm"), "EditStayPage"),
});
const profileRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: "/profile",
  // ?onboarding=phone (set by the post-login soft nudge for users with no phone) focuses the phone
  // field and shows an explanatory banner.
  validateSearch: (s): { onboarding?: "phone" } => ({ onboarding: s.onboarding === "phone" ? "phone" : undefined }),
  component: lazyRouteComponent(() => import("./features/profile/Profile"), "ProfilePage"),
});
// Discovery (feature 003 US1): search an area → potential + hosted minyanim.
const discoveryRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: "/discovery",
  // Optional pre-fill from the "Minyanim near this stay" link (FR-019). `kind=minyan` arrives from a
  // minyan-specific entry point (Stay ⋮ "search minyanim") → pre-applies the Minyanim kind filter (US2).
  validateSearch: (s): { lat?: number; lng?: number; city?: string; country?: string; from?: number; to?: number; kind?: "minyan" | "hosting" | "social" } => ({
    lat: typeof s.lat === "number" ? s.lat : undefined,
    lng: typeof s.lng === "number" ? s.lng : undefined,
    city: typeof s.city === "string" ? s.city : undefined,
    country: typeof s.country === "string" ? s.country : undefined,
    from: typeof s.from === "number" ? s.from : undefined,
    to: typeof s.to === "number" ? s.to : undefined,
    kind: s.kind === "minyan" || s.kind === "hosting" || s.kind === "social" ? s.kind : undefined,
  }),
  component: lazyRouteComponent(() => import("./features/discovery/DiscoveryPage"), "DiscoveryPage"),
});
// Host a Minyan (003 US2) — auth-guarded.
const minyanNewRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: "/minyan/new",
  // Pre-fill the host form: ?fromStay=<id> (from a saved location), or lat/lng/city/country/date
  // /nearby from the discovery "organize a minyan here" button (potential → host).
  validateSearch: (s): { fromStay?: string; lat?: number; lng?: number; city?: string; country?: string; date?: string; nearby?: number } => ({
    fromStay: typeof s.fromStay === "string" ? s.fromStay : undefined,
    lat: typeof s.lat === "number" ? s.lat : undefined,
    lng: typeof s.lng === "number" ? s.lng : undefined,
    city: typeof s.city === "string" ? s.city : undefined,
    country: typeof s.country === "string" ? s.country : undefined,
    date: typeof s.date === "string" ? s.date : undefined,
    nearby: typeof s.nearby === "number" ? s.nearby : undefined,
  }),
  component: lazyRouteComponent(() => import("./features/events/HostMinyanForm"), "HostMinyanForm"),
});
// Host an event (014) — kind picker + hosting/social form. ?kind=minyan deep-links to /minyan/new.
const eventNewRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: "/event/new",
  validateSearch: (s): { kind?: "minyan" | "hosting" | "social"; fromStay?: string; lat?: number; lng?: number; city?: string; country?: string; date?: string } => ({
    kind: s.kind === "minyan" || s.kind === "hosting" || s.kind === "social" ? s.kind : undefined,
    fromStay: typeof s.fromStay === "string" ? s.fromStay : undefined,
    lat: typeof s.lat === "number" ? s.lat : undefined,
    lng: typeof s.lng === "number" ? s.lng : undefined,
    city: typeof s.city === "string" ? s.city : undefined,
    country: typeof s.country === "string" ? s.country : undefined,
    date: typeof s.date === "string" ? s.date : undefined,
  }),
  component: lazyRouteComponent(() => import("./features/events/HostEventForm"), "HostEventPage"),
});
// Edit an event (014) — host-only; loads the event, guards non-hosts, renders the matching form in edit mode.
const eventEditRoute = createRoute({ getParentRoute: () => authedLayout, path: "/event/$id/edit", component: lazyRouteComponent(() => import("./features/events/EditEventPage"), "EditEventPage") });
// My events (014 US1 — Screen 7): hosted + attending, host requests-queue badge.
const myEventsRoute = createRoute({ getParentRoute: () => authedLayout, path: "/my-events", component: lazyRouteComponent(() => import("./features/events/MyEvents"), "MyEvents") });
// Notifications inbox (003 US5).
const notificationsRoute = createRoute({ getParentRoute: () => authedLayout, path: "/notifications", component: lazyRouteComponent(() => import("./features/notifications/NotificationsInbox"), "NotificationsInbox") });
// Direct messages (008): inbox + per-correspondent thread.
const messagesRoute = createRoute({ getParentRoute: () => authedLayout, path: "/messages", component: lazyRouteComponent(() => import("./features/messages/Messages"), "MessagesPage") });
const messageThreadRoute = createRoute({ getParentRoute: () => authedLayout, path: "/messages/$userId", component: lazyRouteComponent(() => import("./features/messages/Messages"), "MessageThreadPage") });
// Admin surface (010): /admin shell (guards on GET /api/admin/me) with Layers + Places manager tabs.
const adminLayoutRoute = createRoute({ getParentRoute: () => authedLayout, path: "/admin", component: lazyRouteComponent(() => import("./features/admin/AdminLayout"), "AdminLayout") });
const adminLayersRoute = createRoute({ getParentRoute: () => adminLayoutRoute, path: "/", component: lazyRouteComponent(() => import("./features/admin/AdminLayersManager"), "AdminLayersManager") });
const adminPlacesRoute = createRoute({ getParentRoute: () => adminLayoutRoute, path: "/places", component: lazyRouteComponent(() => import("./features/admin/AdminPlacesManager"), "AdminPlacesManager") });
// Moderation queue + sanctions (006 US3).
const adminModerationRoute = createRoute({ getParentRoute: () => adminLayoutRoute, path: "/moderation", component: lazyRouteComponent(() => import("./features/admin/ModerationQueue"), "ModerationQueue") });
// Metrics dashboard (006 US5).
const adminMetricsRoute = createRoute({ getParentRoute: () => adminLayoutRoute, path: "/metrics", component: lazyRouteComponent(() => import("./features/admin/AdminMetrics"), "AdminMetrics") });
// Kosher places near a location (010 US1). ?lat&lng (from a Stay) anchor "nearby"; absent → pick one.
const placesRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: "/places",
  validateSearch: (s): { lat?: number; lng?: number; city?: string; country?: string } => ({
    lat: typeof s.lat === "number" ? s.lat : undefined,
    lng: typeof s.lng === "number" ? s.lng : undefined,
    city: typeof s.city === "string" ? s.city : undefined,
    country: typeof s.country === "string" ? s.country : undefined,
  }),
  component: lazyRouteComponent(() => import("./features/places/PlacesView"), "PlacesView"),
});
// Minyan detail (003 US2) — PUBLIC (root-level) so the WhatsApp join link works pre-auth (D13).
const minyanDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: "/minyan/$id", component: lazyRouteComponent(() => import("./features/events/MinyanDetail"), "MinyanDetail") });
// Generic event detail (014) — PUBLIC so unlisted/link shares work pre-auth. ?published=unlisted
// shows a one-time copy-link confirmation after publishing.
const eventDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/event/$id",
  validateSearch: (s): { published?: "unlisted" } => ({ published: s.published === "unlisted" ? "unlisted" : undefined }),
  component: lazyRouteComponent(() => import("./features/events/MinyanDetail"), "EventDetail"),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  registerRoute,
  forgotRoute,
  resetRoute,
  verifyRoute,
  minyanDetailRoute,
  eventDetailRoute,
  authedLayout.addChildren([staysRoute, staysHistoryRoute, staysNewRoute, staysEditRoute, profileRoute, discoveryRoute, minyanNewRoute, eventNewRoute, eventEditRoute, myEventsRoute, notificationsRoute, messagesRoute, messageThreadRoute, adminLayoutRoute.addChildren([adminLayersRoute, adminPlacesRoute, adminModerationRoute, adminMetricsRoute]), placesRoute]),
]);

export const router = createRouter({ routeTree, defaultNotFoundComponent: NotFound });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
