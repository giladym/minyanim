# Integration Setup — Transactional Email (verification & password reset)

Email/password auth needs to **send** email (verification + reset). Cloudflare Workers can't
send email directly, so we use an HTTP-API provider. **Recommended: Resend** (swappable behind
a small `sendEmail()` util). Secrets follow [`../secrets.md`](../secrets.md).

## What you'll get

- `RESEND_API_KEY` (or the equivalent for your chosen provider)
- A verified **sending domain** (e.g. `mail.minyanim.app`) with DNS records

## Steps (Resend)

1. Create a Resend account → **API Keys → Create** → copy the key (shown once).
2. **Domains → Add Domain** → enter your sending domain → add the shown **DNS records**
   (SPF/`TXT`, **DKIM** `CNAME`/`TXT`, and a **DMARC** record) at your DNS host. Wait for
   verification (green).
3. Set a `from` address on that domain (e.g. `Minyanim <no-reply@mail.minyanim.app>`).

> Use a **subdomain** for sending (e.g. `mail.`) to protect your root domain's reputation.
> Use a **separate domain/key per environment** where practical (dev/staging/prod).

## Where to put the key

**Local** — `apps/backend/.dev.vars` (git-ignored):
```
RESEND_API_KEY="…"
```
**Production**:
```bash
cd apps/backend
wrangler secret put RESEND_API_KEY
```
The backend reads it via the `env` binding; it is never in the repo or client bundle.

## Notes

- Email templates are **localized (he/en)** per the user's language.
- Reset/verification responses must not reveal whether an address is registered (no account
  enumeration) — see contract.
- Swapping providers (Postmark/SES/Brevo/Mailgun) only changes the `sendEmail()` util + the
  secret; the auth flows are unchanged.
- This same email pipeline would later enable passwordless (magic-link) with no new dependency.
