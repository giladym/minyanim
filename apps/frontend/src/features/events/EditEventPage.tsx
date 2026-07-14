import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "@tanstack/react-router";
import type { OwnerMinyanDTO, OwnerGatheringDTO } from "@minyanim/shared";
import { useMinyan, type AnyEventDTO } from "../../lib/events";
import { HostMinyanForm } from "./HostMinyanForm";
import { HostEventForm } from "./HostEventForm";

/** True only for the host tier (`getMinyan` returns an owner DTO with `isHost: true` to the host). */
function isEventOwner(e: AnyEventDTO): e is OwnerMinyanDTO | OwnerGatheringDTO {
  return (e as { isHost?: boolean }).isHost === true;
}

/**
 * Edit route entry (`/event/$id/edit`, 014). Loads the event via `getMinyan` (the host receives the
 * owner tier), then renders the matching create form in EDIT mode, prefilled from the event. A
 * non-host viewer is redirected to the event's public detail — only the host may edit. The kind /
 * type is derived from the loaded event and is fixed (not changeable while editing).
 */
export function EditEventPage() {
  const { id } = useParams({ from: "/authed/event/$id/edit" });
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: event, isLoading } = useMinyan(id);

  // Not the host → this page isn't theirs; send them to the public detail.
  useEffect(() => {
    if (event && !isEventOwner(event)) void navigate({ to: "/event/$id", params: { id }, search: {} });
  }, [event, id, navigate]);

  if (isLoading) return <p className="p-6 text-muted" dir="rtl">{t("discovery.loading")}</p>;
  if (!event) return <p className="p-6 text-muted" dir="rtl">{t("stays.loadError")}</p>;
  if (!isEventOwner(event)) return null; // redirecting

  if (event.type === "minyan") return <HostMinyanForm editEvent={event} />;
  const kind = event.category === "hosting" ? "hosting" : "social";
  return <HostEventForm kind={kind} ctx={{}} editEvent={event} />;
}
