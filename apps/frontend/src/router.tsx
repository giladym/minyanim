import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet, redirect } from "@tanstack/react-router";
import { Home } from "./routes/home";
import { authClient } from "./lib/auth-client";

// Homepage is eager (prerendered entry); auth/shell/profile are code-split into their own
// chunks so they don't bloat the initial homepage download (T056).
const lazyAuth = (name: "SignIn" | "Register" | "ForgotPassword" | "ResetPassword" | "VerifyEmail" | "StaysPlaceholder") =>
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

const staysRoute = createRoute({ getParentRoute: () => authedLayout, path: "/stays", component: lazyAuth("StaysPlaceholder") });
const profileRoute = createRoute({ getParentRoute: () => authedLayout, path: "/profile", component: lazyRouteComponent(() => import("./features/profile/Profile"), "ProfilePage") });

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  registerRoute,
  forgotRoute,
  resetRoute,
  verifyRoute,
  authedLayout.addChildren([staysRoute, profileRoute]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
