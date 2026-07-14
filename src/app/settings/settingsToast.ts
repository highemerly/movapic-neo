import { toast } from "sonner";

// 設定ページのトーストは既定（約4秒）より短く消す。保存操作が頻繁で、確認表示は一瞬で十分なため
// （この短縮は設定ページのトーストに限定する）。
export const SETTINGS_TOAST_DURATION = 2000;

/** 「保存しました」トースト。同じ id を渡すと連続保存が1枚に集約される。 */
export function toastSaved(id: string) {
  toast.success("保存しました", { id, duration: SETTINGS_TOAST_DURATION });
}

/** 設定ページのエラートースト（成功と同じく短め）。 */
export function toastSettingsError(message: string) {
  toast.error(message, { duration: SETTINGS_TOAST_DURATION });
}
