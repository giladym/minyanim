import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { Home } from "./routes/home";
import { SignIn, Register, ForgotPassword, ResetPassword, VerifyEmail, StaysPlaceholder } from "./features/auth/AuthScreens";
import { AppShell } from "./components/AppShell";
import { authClient } from "./lib/auth-client";

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  validateSearch: (s): { redirect?: string } => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: SignIn,
});
const registerRoute = createRoute({ getParentRoute: () => rootRoute, path: "/register", component: Register });
const forgotRoute = createRoute({ getParentRoute: () => rootRoute, path: "/forgot-password", component: ForgotPassword });
const resetRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reset-password", component: ResetPassword });
const verifyRoute = createRoute({ getParentRoute: () => rootRoute, path: "/verify-email", component: VerifyEmail });

// Authenticated layout: guard (redirect to sign-in if no session) + app shell (T036/T041).
const authedLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "authed",
  beforeLoad: async ({ location }) => {
    const { data } = await authClient.getSession();
    if (!data) throw redirect({ to: "/sign-in", search: { redirect: location.pathname } });
  },
  component: AppShell,
});

const staysRoute = createRoute({ getParentRoute: () => authedLayout, path: "/stays", component: StaysPlaceholder });

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  registerRoute,
  forgotRoute,
  resetRoute,
  verifyRoute,
  authedLayout.addChildren([staysRoute]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
