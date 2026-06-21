import { Hono } from "hono";
import { CreateFolderInput, UpdateFolderInput } from "@minyanim/shared";
import { createAuth } from "../auth";
import { createDb } from "../db/client";
import { Unauthorized } from "../lib/errors";
import {
  listFoldersController,
  createFolderController,
  renameFolderController,
  deleteFolderController,
} from "../controllers/folderController";
import type { Env } from "../env";

export const folders = new Hono<{ Bindings: Env }>();

/** Resolve the authenticated user id from the better-auth session, or 401. (mirrors routes/stays) */
async function requireUserId(c: { env: Env; req: { raw: Request } }): Promise<string> {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) throw Unauthorized();
  return session.user.id;
}

folders.get("/api/folders", async (c) => {
  const userId = await requireUserId(c);
  return c.json(await listFoldersController(createDb(c.env.DB), userId));
});

folders.post("/api/folders", async (c) => {
  const userId = await requireUserId(c);
  const parsed = CreateFolderInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) },
      400,
    );
  }
  return c.json(await createFolderController(createDb(c.env.DB), userId, parsed.data.name), 201);
});

folders.patch("/api/folders/:id", async (c) => {
  const userId = await requireUserId(c);
  const parsed = UpdateFolderInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), code: i.message })) },
      400,
    );
  }
  return c.json(
    await renameFolderController(createDb(c.env.DB), userId, c.req.param("id"), parsed.data.name),
  );
});

folders.delete("/api/folders/:id", async (c) => {
  const userId = await requireUserId(c);
  const body = (await c.req.json().catch(() => ({}))) as { confirm?: boolean };
  return c.json(
    await deleteFolderController(createDb(c.env.DB), userId, c.req.param("id"), body.confirm === true),
  );
});
