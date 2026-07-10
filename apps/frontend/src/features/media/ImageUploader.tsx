import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ImageKind } from "@minyanim/shared";
import { ApiError } from "../../lib/api";
import { uploadImage } from "../../lib/media";

/**
 * Shared, RTL/mobile image-upload control (012). A labeled file input that downscales + uploads one
 * image and reports the stored ref. Visible progress + localized error; ≥44 px, keyboard-operable.
 */
export function ImageUploader({
  kind,
  parentId,
  label,
  onUploaded,
  disabled,
}: {
  kind: ImageKind;
  parentId: string;
  label?: string;
  onUploaded: (ref: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState("");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setErr("");
    setPending(true);
    try {
      onUploaded(await uploadImage(kind, parentId, file));
    } catch (e2) {
      const code = e2 instanceof ApiError ? e2.body.errors[0]?.code : undefined;
      setErr(code ? t(`errors.${code}`) : t("media.uploadFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label={label ?? t("media.addPhoto")}
        disabled={disabled || pending}
        onChange={(e) => void onPick(e)}
      />
      <button
        type="button"
        disabled={disabled || pending}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 font-bold text-primary-ink disabled:opacity-50"
        onClick={() => inputRef.current?.click()}
      >
        {pending ? t("media.uploading") : (label ?? t("media.addPhoto"))}
      </button>
      {err && <p role="alert" className="text-sm font-semibold text-clay-ink">{err}</p>}
    </div>
  );
}
