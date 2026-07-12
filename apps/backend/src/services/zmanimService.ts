import type { ZmanimResponse } from "@minyanim/shared";
import type { Db } from "../db/client";
import { getStayById } from "../repositories/stayRepository";
import { getMinyanById, getEventById } from "../repositories/eventRepository";
import {
  tzFromCoords,
  civilDate,
  todayCivil,
  coversShabbat,
  isSaturday,
  shabbatSaturdaysInRange,
} from "../lib/timezone";
import { computeShabbatZmanim, candleLightingOffsetMinutes } from "../lib/zmanim";

/** Is a stored UTC-midnight departure date in the past at the destination (active-only gate, D9)? */
function isPastAt(departure: Date, lat: number, lng: number): boolean {
  return civilDate(departure, "UTC") < todayCivil(tzFromCoords(lat, lng));
}

const EMPTY = (coversShabbatFlag: boolean, hasCoordinates: boolean): ZmanimResponse => ({
  coversShabbat: coversShabbatFlag,
  hasCoordinates,
  candleLightingOffsetMinutes: 18,
  shabbatot: [],
});

/**
 * Shabbat zmanim for an owned Stay (D5). Returns `null` when the Stay is missing or not owned (the
 * controller maps that to 404). Coordless Stays short-circuit to `hasCoordinates:false` (the FE
 * shows the add-location CTA, D6) — no isPast check is needed since they yield no times either way.
 * Cancelled or past (active-only, D9) Stays return empty. Otherwise one entry per in-range Shabbat.
 */
export async function stayZmanim(
  db: Db,
  userId: string,
  stayId: string,
): Promise<ZmanimResponse | null> {
  const row = await getStayById(db, userId, stayId);
  if (!row) return null;

  const covers = coversShabbat(row.arrivalDate, row.departureDate, "UTC");
  const hasCoords = row.lat != null && row.lng != null;
  if (!hasCoords) return EMPTY(covers, false);
  if (row.status === "cancelled" || isPastAt(row.departureDate, row.lat!, row.lng!)) {
    return EMPTY(covers, true);
  }

  const saturdays = shabbatSaturdaysInRange(
    row.arrivalDate,
    row.departureDate,
    row.arrivalDate,
    row.departureDate,
  );
  return {
    coversShabbat: covers,
    hasCoordinates: true,
    candleLightingOffsetMinutes: candleLightingOffsetMinutes(row.lat!, row.lng!),
    shabbatot: saturdays.map((s) => computeShabbatZmanim(row.lat!, row.lng!, s)),
  };
}

/**
 * Shabbat zmanim for a hosted Minyan (D9/R10) — public. A Minyan has a single `eventDate` (not a
 * range), so it yields at most one entry, only when that date is a Saturday and the event is active
 * (not cancelled, not past). Computed from the event's exact coordinates server-side (identical for
 * all viewers). Returns `null` if the event doesn't exist (controller → 404).
 */
export async function minyanZmanim(db: Db, eventId: string): Promise<ZmanimResponse | null> {
  const m = await getMinyanById(db, eventId);
  if (!m) return null;

  const isShabbat = isSaturday(m.eventDate);
  const isCancelled = m.storedStatus === "cancelled";
  const isPast = isPastAt(m.eventDate, m.lat, m.lng);
  if (!isShabbat || isCancelled || isPast) return EMPTY(isShabbat, true);

  const shabbatDate = civilDate(m.eventDate, "UTC");
  return {
    coversShabbat: true,
    hasCoordinates: true,
    candleLightingOffsetMinutes: candleLightingOffsetMinutes(m.lat, m.lng),
    shabbatot: [computeShabbatZmanim(m.lat, m.lng, shabbatDate)],
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Shabbat zmanim for ANY hosted event (005, generalized in 014 T046). Minyan behavior is UNCHANGED
 * (candle-lighting only when the event date is a Saturday — SC-005). A **hosting** gathering whose
 * occasion is Shabbat additionally maps the flagship Shabbat-**dinner** (Friday-dated) to the next
 * day's Shabbat, and a Shabbat lunch/seudah (Saturday-dated) to that Shabbat — so a guest sees the
 * correct candle-lighting time. Festivals are out of v1 (they need Hebrew-calendar dates). Computed
 * SERVER-SIDE ONLY (kosher-zmanim never ships to the client — ADR 0007). `null` → 404.
 */
export async function eventZmanim(db: Db, eventId: string): Promise<ZmanimResponse | null> {
  const m = await getEventById(db, eventId);
  if (!m) return null;

  // Which Saturday (civil) does this event's Shabbat fall on, if any?
  let saturday: Date | null = null;
  if (m.type === "minyan") {
    if (isSaturday(m.eventDate)) saturday = m.eventDate; // minyan: Saturday-only, unchanged
  } else if (m.category === "hosting" && m.occasion === "shabbat") {
    const dow = m.eventDate.getUTCDay();
    if (dow === 6) saturday = m.eventDate; // Shabbat lunch / seudah shlishit
    else if (dow === 5) saturday = new Date(m.eventDate.getTime() + DAY_MS); // Shabbat dinner (Fri eve)
  }

  const cancelled = m.storedStatus === "cancelled";
  const past = isPastAt(m.eventDate, m.lat, m.lng);
  if (!saturday || cancelled || past) return EMPTY(saturday !== null, true);

  const shabbatDate = civilDate(saturday, "UTC");
  return {
    coversShabbat: true,
    hasCoordinates: true,
    candleLightingOffsetMinutes: candleLightingOffsetMinutes(m.lat, m.lng),
    shabbatot: [computeShabbatZmanim(m.lat, m.lng, shabbatDate)],
  };
}
