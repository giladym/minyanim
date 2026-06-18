import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { Home } from "./routes/home";
import { SignIn, Register, ForgotPassword, ResetPassword, VerifyEmail, StaysPlaceholder } from "./features/auth/AuthScreens";
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

// Protected: requires a session, else redirect to sign-in with a return path (T036).
const staysRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/stays",
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (!data) throw redirect({ to: "/sign-in", search: { redirect: "/stays" } });
  },
  component: StaysPlaceholder,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  registerRoute,
  forgotRoute,
  resetRoute,
  verifyRoute,
  staysRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
