import { drizzle } from "drizzle-orm/d1";

/** Build a Drizzle client bound to the request's D1 instance. */
export function createDb(d1: D1Database) {
  return drizzle(d1);
}

export type Db = ReturnType<typeof createDb>;
