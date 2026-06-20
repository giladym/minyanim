import { describe, it, expect } from "vitest";
import { deriveStatus } from "../src/lib/minyanStatus";
import type { MinyanService } from "@minyanim/shared";

// A guaranteed future Saturday (so events are never "completed" and isSaturday is true).
function futureSaturday(): Date {
  let t = Date.UTC(2030, 0, 1);
  while (new Date(t).getUTCDay() !== 6) t += 86400000;
  return new Date(t);
}
const SAT = futureSaturday();
const LON = { lat: 51.5074, lng: -0.1278 };
const SHACHARIT: MinyanService[] = [{ tefilla: "shacharit", time: "08:30" }];
const MAARIV: MinyanService[] = [{ tefilla: "maariv", time: null }];

describe("deriveStatus — SC-004 readiness decision table (24 cells)", () => {
  for (const men of [9, 10, 11]) {
    for (const seferTorah of [false, true]) {
      for (const baalKorei of [false, true]) {
        for (const shabbatShacharit of [false, true]) {
          const services = shabbatShacharit ? SHACHARIT : MAARIV;
          const expected =
            men < 10
              ? "forming"
              : !shabbatShacharit
                ? "ready"
                : seferTorah && baalKorei
                  ? "ready"
                  : "quorum-reached";
          it(`men=${men} torah=${seferTorah} korei=${baalKorei} shabbatShacharit=${shabbatShacharit} → ${expected}`, () => {
            expect(
              deriveStatus({
                storedStatus: "forming",
                eventDate: SAT,
                lat: LON.lat,
                lng: LON.lng,
                committedMen: men,
                seferTorah,
                services,
                baalKoreiClaimed: baalKorei,
              }),
            ).toBe(expected);
          });
        }
      }
    }
  }

  it("cancelled (stored) and completed (past date) override the table", () => {
    const base = { eventDate: SAT, lat: LON.lat, lng: LON.lng, committedMen: 20, seferTorah: true, services: SHACHARIT, baalKoreiClaimed: true };
    expect(deriveStatus({ ...base, storedStatus: "cancelled" })).toBe("cancelled");
    expect(deriveStatus({ ...base, storedStatus: "forming", eventDate: new Date(Date.UTC(2020, 0, 4)) })).toBe("completed");
  });
});
