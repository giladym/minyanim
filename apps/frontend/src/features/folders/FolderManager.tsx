import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { FolderDTO } from "@minyanim/shared";
import { ApiError } from "../../lib/api";
import { Icon } from "../../components/Icon";
import { useFolders, useCreateFolder, useRenameFolder, useSetFolderPinned, useDeleteFolder } from "../../lib/folders";

const fieldCls =
  "w-full rounded-xl border border-line2 bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-clay";

/**
 * Folder management dialog (US1, FR-001/FR-003): create, rename, and delete the caller's folders.
 * Deleting a non-empty folder shows a reassign-to-Unfiled warning (its Stays are never deleted —
 * D4). Owner-only; all strings i18n, colors tokens-only, ≥44px targets, `aria-live` on changes.
 */
export function FolderManager({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { data: folders } = useFolders();
  const create = useCreateFolder();
  const rename = useRenameFolder();
  const setPinned = useSetFolderPinned();
  const del = useDeleteFolder();

  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [editError, setEditError] = useState("");
  const [confirming, setConfirming] = useState<FolderDTO | null>(null);

  function errorCode(err: unknown): string {
    if (err instanceof ApiError && err.body.errors[0]?.code) return err.body.errors[0].code;
    return "server.error";
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    try {
      await create.mutateAsync(newName.trim());
      setNewName("");
    } catch (err) {
      setCreateError(errorCode(err));
    }
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditError("");
    try {
      await rename.mutateAsync({ id: editing.id, name: editing.name.trim() });
      setEditing(null);
    } catch (err) {
      setEditError(errorCode(err));
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("folders.manageTitle")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6"
      dir="rtl"
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-ink">{t("folders.manageTitle")}</h2>
          <button type="button" className="text-sm font-bold text-clay" onClick={onClose}>
            {t("folders.close")}
          </button>
        </div>

        <form onSubmit={submitCreate} className="flex flex-col gap-2">
          <label className="block text-sm font-bold text-ink">{t("folders.newLabel")}</label>
          <div className="flex gap-2">
            <input
              className={fieldCls}
              value={newName}
              maxLength={60}
              aria-label={t("folders.newLabel")}
              placeholder={t("folders.newPlaceholder")}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              type="submit"
              disabled={create.isPending || !newName.trim()}
              className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-on-primary disabled:opacity-60"
            >
              {t("folders.create")}
            </button>
          </div>
          {createError && (
            <span role="alert" className="text-sm font-semibold text-clay-ink">
              {t(`errors.${createError}`)}
            </span>
          )}
        </form>

        <ul aria-live="polite" className="flex flex-col gap-2">
          {(folders ?? []).map((f) =>
            editing?.id === f.id ? (
              <li key={f.id}>
                <form onSubmit={submitRename} className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      className={fieldCls}
                      value={editing.name}
                      maxLength={60}
                      autoFocus
                      aria-label={t("folders.renameLabel")}
                      onChange={(e) => setEditing({ id: f.id, name: e.target.value })}
                    />
                    <button
                      type="submit"
                      disabled={rename.isPending || !editing.name.trim()}
                      className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-on-primary disabled:opacity-60"
                    >
                      {t("folders.save")}
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded-xl border border-line px-3 py-2.5 text-sm font-bold text-ink"
                      onClick={() => setEditing(null)}
                    >
                      {t("folders.cancel")}
                    </button>
                  </div>
                  {editError && (
                    <span role="alert" className="text-sm font-semibold text-clay-ink">
                      {t(`errors.${editError}`)}
                    </span>
                  )}
                </form>
              </li>
            ) : (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5"
              >
                <span className="flex items-center gap-2 font-bold text-ink">
                  <button
                    type="button"
                    className={f.pinned ? "text-gold" : "text-faint"}
                    aria-label={f.pinned ? t("folders.unpin") : t("folders.pin")}
                    aria-pressed={f.pinned}
                    onClick={() => setPinned.mutate({ id: f.id, pinned: !f.pinned })}
                  >
                    <Icon name="star" size={18} {...(f.pinned ? { fill: "currentColor" } : {})} />
                  </button>
                  {f.name}
                  <span className="text-xs font-normal text-muted">
                    {t("folders.stayCount", { count: f.stayCount })}
                  </span>
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-line px-3 py-1.5 text-sm font-bold text-ink"
                    onClick={() => {
                      setEditError("");
                      setEditing({ id: f.id, name: f.name });
                    }}
                  >
                    {t("folders.rename")}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-clay-ink px-3 py-1.5 text-sm font-bold text-clay-ink"
                    onClick={() => setConfirming(f)}
                  >
                    {t("folders.delete")}
                  </button>
                </span>
              </li>
            ),
          )}
          {folders && folders.length === 0 && (
            <li className="py-4 text-center text-sm text-muted">{t("folders.none")}</li>
          )}
        </ul>
      </div>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("folders.deleteTitle")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6"
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6">
            <h2 className="mb-2 text-lg font-extrabold text-clay-ink">{t("folders.deleteTitle")}</h2>
            <p className="mb-4 text-sm text-muted">
              {confirming.stayCount > 0
                ? t("folders.deleteWarn", { count: confirming.stayCount })
                : t("folders.deleteEmpty")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-clay-ink px-4 py-2 text-sm font-extrabold text-on-clay"
                onClick={() => {
                  del.mutate(confirming.id);
                  setConfirming(null);
                }}
              >
                {t("folders.deleteConfirm")}
              </button>
              <button
                type="button"
                className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-ink"
                onClick={() => setConfirming(null)}
              >
                {t("folders.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
