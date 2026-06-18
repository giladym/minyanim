import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Announces route changes to screen readers and moves focus to the main region (SPA a11y, T044).
 * A visually-hidden polite live region updates with the current path on navigation.
 */
export function RouteAnnouncer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setMsg(pathname);
    const main = document.getElementById("main");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus();
    }
  }, [pathname]);

  return (
    <div aria-live="polite" className="sr-only">
      {msg}
    </div>
  );
}
