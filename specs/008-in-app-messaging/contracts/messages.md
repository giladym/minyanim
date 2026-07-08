# Phase 1 API Contracts — In-App Direct Messaging

Base: `/api` on the backend Worker (Hono). Conventions inherited from 001–007: `401 auth.required` on
every messaging endpoint; `404 resource.not_found` for a missing recipient (never leaks existence);
validation returns `400 { errors:[{field,code}] }`; DTOs hand-built before `c.json()`. Every endpoint
authenticates via `requireUserId` from `lib/auth.ts`.

---

## Messages

### `POST /api/messages`  (send)
Send a direct message to another user. Body validated by `sendMessageSchema`.
- Self-send (`recipientUserId === caller`) → `400 message.self` (nothing stored).
- Recipient does not exist → `404 resource.not_found`.
- Recipient has `acceptMessages: false` → `403 message.opted_out`.
- Sender over the rate limit (≥ 20 in the trailing 5 min) → `429 rate.limited`.
- Otherwise inserts and returns the created message from the **sender's** perspective (`mine: true`).
→ `201 MessageDTO` · `400` (validation or `message.self`) · `401` · `403 message.opted_out` ·
`404` · `429 rate.limited`.

### `GET /api/messages`  (inbox)
The caller's conversations (one preview per other party, newest-activity-first) + total unread count.
→ `200 { conversations: ConversationDTO[], unread: number }` · `401`.

### `GET /api/messages/:userId`  (thread — marks read)
The full thread between the caller and `:userId`, oldest-first. **Side effect**: marks the caller's
unread messages received from that party as read (D7), which clears the unread badge.
- `:userId` does not exist → `404 resource.not_found`.
→ `200 ThreadDTO` · `401` · `404`.

---

## Request / response shapes (`packages/shared/src/schemas/message.ts`)

### `sendMessageSchema` → `SendMessageInput`
```ts
z.object({
  recipientUserId: z.string().min(1, "message.recipient_required"),
  body: z.string().trim().min(1, "message.body_required").max(2000, "message.body_too_long"),
})
```
Validation failures return the standard `400 { errors: [{ field, code }] }` shape, where `code` is
the message key above (e.g. `message.body_too_long`).

### `MessageDTO`
```jsonc
{
  "id": "…",
  "body": "מתפללים יחד בשבת?",
  "mine": true,          // true when the VIEWER sent it (drives bubble alignment)
  "read": false,
  "createdAt": 1751932800000   // epoch ms
}
```

### `ConversationDTO`  (one inbox preview per other party)
```jsonc
{
  "userId": "other-party-id",  // the OTHER participant
  "name": "רבקה",
  "lastBody": "נתראה ליד הכניסה",
  "lastAt": 1751932800000,     // epoch ms of the latest message
  "unread": 2                  // unread messages the viewer received in this conversation
}
```

### `ThreadDTO`  (GET /api/messages/:userId)
```jsonc
{
  "userId": "other-party-id",
  "name": "רבקה",
  "messages": [ /* MessageDTO[], oldest-first */ ]
}
```

### Inbox response  (GET /api/messages)
```jsonc
{
  "conversations": [ /* ConversationDTO[], newest-activity-first */ ],
  "unread": 3        // the viewer's TOTAL unread across all conversations
}
```

---

## Profile (extends 001)

### `GET /api/me` / `PATCH /api/me` (existing)
`Profile` gains **`acceptMessages`** (boolean, default `true`); `updateProfileSchema` accepts it
(`z.boolean().optional()`). Mirrors the existing `language`/`theme`/`sharePhone` round-trip. Setting
`acceptMessages: false` causes subsequent sends **to** this user to be rejected `403
message.opted_out`. → `200 Profile`.

---

## Errors  (`packages/shared/src/errors.ts`)

Two new error codes; the rate-limit code is reused:

| Constant | Code | Status | Meaning |
|----------|------|--------|---------|
| `MESSAGE_SELF` | `message.self` | 400 | Cannot message yourself. |
| `MESSAGE_OPTED_OUT` | `message.opted_out` | 403 | Recipient has turned off receiving messages (D2). |
| `RATE_LIMITED` (existing) | `rate.limited` | 429 | Sender exceeded 20 messages / 5 min (D3). |
| `RESOURCE_NOT_FOUND` (existing) | `resource.not_found` | 404 | Recipient / correspondent does not exist. |
| `AUTH_REQUIRED` (existing) | `auth.required` | 401 | Not signed in. |

Error responses use the standard `{ errors: [{ field, code }] }` shape.

## Shared contracts (`packages/shared`)
- `schemas/message.ts`: `sendMessageSchema` / `SendMessageInput`; `MessageDTO`, `ConversationDTO`,
  `ThreadDTO` (TS interfaces — no inbound parsing).
- `schemas/profile.ts` (extend): `acceptMessages` on the `Profile` interface + `updateProfileSchema`.
- `errors.ts` (extend): `MESSAGE_SELF`, `MESSAGE_OPTED_OUT`.
