import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { ZmanimResponse } from "@minyanim/shared";
import { ZmanimSection } from "./ZmanimSection";
import "../../i18n";

const base: ZmanimResponse = {
  coversShabbat: true,
  hasCoordinates: true,
  candleLightingOffsetMinutes: 18,
  shabbatot: [
    { shabbatDate: "2026-07-04", candleLighting: "21:08", havdalahGeonim: "22:43", havdalahRabbeinuTam: "23:32", note: null },
  ],
};

const render1 = (data: ZmanimResponse, opinion = "geonim", slot?: React.ReactNode) =>
  render(<ZmanimSection data={data} isLoading={false} isError={false} havdalahOpinion={opinion} addLocationSlot={slot} />);

describe("ZmanimSection (005 US1)", () => {
  it("renders candle-lighting + the Geonim Havdalah by default", () => {
    render1(base);
    expect(screen.getByText("הדלקת נרות")).toBeInTheDocument();
    expect(screen.getByText("21:08")).toBeInTheDocument();
    expect(screen.getByText("צאת השבת")).toBeInTheDocument();
    expect(screen.getByText("22:43")).toBeInTheDocument(); // geonim, not RT
    expect(screen.queryByText("23:32")).not.toBeInTheDocument();
  });

  it("shows the Rabbeinu Tam time when the opinion is rabbeinu_tam", () => {
    render1(base, "rabbeinu_tam");
    expect(screen.getByText("23:32")).toBeInTheDocument();
    expect(screen.queryByText("22:43")).not.toBeInTheDocument();
  });

  it("shows both, labeled, when the opinion is both", () => {
    render1(base, "both");
    expect(screen.getByText("צאת השבת (גאונים)")).toBeInTheDocument();
    expect(screen.getByText("22:43")).toBeInTheDocument();
    expect(screen.getByText("צאת השבת (ר״ת)")).toBeInTheDocument();
    expect(screen.getByText("23:32")).toBeInTheDocument();
  });

  it("renders the add-location CTA for a coordless Stay", () => {
    render1(
      { ...base, hasCoordinates: false, shabbatot: [] },
      "geonim",
      <a href="/edit">הוספת מיקום</a>,
    );
    expect(screen.getByText(/כדי לראות זמני שבת/)).toBeInTheDocument();
    expect(screen.getByText("הוספת מיקום")).toBeInTheDocument();
  });

  it("shows the 'cannot compute' note for an uncomputable Shabbat", () => {
    render1({
      ...base,
      shabbatot: [{ shabbatDate: "2026-06-27", candleLighting: null, havdalahGeonim: null, havdalahRabbeinuTam: null, note: "uncomputable" }],
    });
    expect(screen.getByText(/לא ניתן לחשב/)).toBeInTheDocument();
  });

  it("shows the Yom-Tov note but still shows candle-lighting", () => {
    render1({
      ...base,
      shabbatot: [{ shabbatDate: "2026-07-04", candleLighting: "21:08", havdalahGeonim: null, havdalahRabbeinuTam: null, note: "havdalah_yom_tov" }],
    });
    expect(screen.getByText("21:08")).toBeInTheDocument(); // candle-lighting still shown
    expect(screen.getByText(/נדחית למוצאי החג/)).toBeInTheDocument();
  });
});
