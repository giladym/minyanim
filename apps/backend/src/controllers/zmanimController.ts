import type { ZmanimResponse } from "@minyanim/shared";
import type { Db } from "../db/client";
import { NotFound } from "../lib/errors";
import { stayZmanim, minyanZmanim } from "../services/zmanimService";

/** Build the response shape at the boundary (allowlist; mirrors the stay/folder controllers). */
function toResponse(r: ZmanimResponse): ZmanimResponse {
  return {
    coversShabbat: r.coversShabbat,
    hasCoordinates: r.hasCoordinates,
    candleLightingOffsetMinutes: r.candleLightingOffsetMinutes,
    shabbatot: r.shabbatot.map((s) => ({
      shabbatDate: s.shabbatDate,
      candleLighting: s.candleLighting,
      havdalahGeonim: s.havdalahGeonim,
      havdalahRabbeinuTam: s.havdalahRabbeinuTam,
      note: s.note,
    })),
  };
}

/** Zmanim for an owned Stay (404 if missing/not owned). */
export async function stayZmanimController(db: Db, userId: string, stayId: string) {
  const r = await stayZmanim(db, userId, stayId);
  if (!r) throw NotFound();
  return toResponse(r);
}

/** Zmanim for a hosted Minyan (public; 404 if the event doesn't exist). */
export async function minyanZmanimController(db: Db, eventId: string) {
  const r = await minyanZmanim(db, eventId);
  if (!r) throw NotFound();
  return toResponse(r);
}
