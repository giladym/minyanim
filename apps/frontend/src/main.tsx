import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme/tokens.css";

// Phase 1 placeholder. Real shell (TanStack Router + i18n + ThemeProvider) lands in T023/T024.
function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-bg p-6 text-center font-sans text-ink">
      <div className="text-sm font-bold tracking-widest text-clay">מניין · MINYANIM</div>
      <h1 className="text-3xl font-extrabold">בסיס הפלטפורמה מוכן</h1>
      <p className="text-muted">Foundation scaffold ready — building features next.</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
