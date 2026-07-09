import { useEffect } from "react";
import { Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAdminMe } from "../../lib/places";

/**
 * Admin surface shell (010). Guards on `GET /api/admin/me`: a non-admin (403 → query error) is
 * bounced to /stays; while checking, nothing renders. Hosts the Layers / Places manager tabs and is
 * the intended home for future management controls (006).
 */
export function AdminLayout() {
  const { t } = useTranslation();
  const { isLoading, isError, data } = useAdminMe();
  const navigate = useNavigate();
  const path = typeof window !== "undefined" ? window.location.pathname : "";

  useEffect(() => {
    if (isError) void navigate({ to: "/stays" });
  }, [isError, navigate]);

  if (isLoading) return <p className="p-6 text-muted" dir="rtl">{t("discovery.loading")}</p>;
  if (isError || !data?.isAdmin) return null;

  const tab = (active: boolean) =>
    "rounded-lg px-4 py-2 text-sm font-bold " + (active ? "bg-primary text-on-primary" : "border border-line text-muted");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 md:p-6" dir="rtl">
      <h1 className="font-display text-2xl font-extrabold text-ink">{t("admin.title")}</h1>
      <nav className="flex gap-2" aria-label={t("admin.title")}>
        <Link to="/admin" className={tab(path === "/admin")}>{t("admin.layersTab")}</Link>
        <Link to="/admin/places" className={tab(path.startsWith("/admin/places"))}>{t("admin.placesTab")}</Link>
      </nav>
      <Outlet />
    </div>
  );
}
