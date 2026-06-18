# Self-hosted fonts

We **self-host** the Assistant typeface (no Google Fonts hotlinking) to avoid the GDPR
exposure of sending EU users' IPs to Google, and to simplify CSP (research D11).

## To add the font

1. Obtain the **Assistant** variable font `woff2` (OFL-licensed; e.g. from the Google Fonts
   GitHub repo or a self-host service) — weights 400–800.
2. Place it here as `assistant-variable.woff2` (matches the `@font-face` in
   `src/theme/tokens.css`).
3. Until added, the UI falls back to `system-ui` (the `@font-face` simply 404s harmlessly).

Keep only the weights actually used; subset to Hebrew + Latin if size matters.
