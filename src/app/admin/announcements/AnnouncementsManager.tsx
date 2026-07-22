"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import Link from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { parseApiError, formatErrorMessage } from "@/lib/errors";
import { SegmentControl } from "@/components/SegmentControl";
import { AnnouncementTypeIcon } from "@/components/announcements/AnnouncementTypeIcon";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import {
  ANNOUNCEMENT_TYPES,
  announcementTypeLabel,
  formatAnnouncementDate,
  isPublished,
  isPinnedNow,
  type AnnouncementRecord,
  type AnnouncementType,
} from "@/lib/announcements";

// ── datetime-local ⇔ ISO 変換（入力は JST のウォールクロックとして解釈する） ──
/** ISO(UTC) → datetime-local 入力値（JST の "YYYY-MM-DDTHH:mm"）。 */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 16);
}
/** datetime-local 入力値（JST）→ ISO(UTC)。空なら null。 */
function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(`${local}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type FormState = {
  type: AnnouncementType;
  message: string;
  detail: string;
  publishAt: string; // datetime-local
  pinnedUntil: string; // datetime-local
};

function emptyForm(): FormState {
  return {
    type: "info",
    message: "",
    detail: "",
    publishAt: "", // 空欄＝今すぐ公開
    pinnedUntil: "",
  };
}

function toForm(a: AnnouncementRecord): FormState {
  return {
    type: a.type,
    message: a.message,
    detail: a.detail ?? "",
    publishAt: isoToLocalInput(a.publishAt),
    pinnedUntil: isoToLocalInput(a.pinnedUntil),
  };
}

/**
 * 掲載状況バッジ。特筆すべき状態（予約 / バナー掲載中）だけ返し、通常公開分は
 * 自明なので null（バッジなし）。
 */
function statusBadge(a: AnnouncementRecord, now: number) {
  if (!isPublished(a, now)) {
    return { label: "予約", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" };
  }
  if (isPinnedNow(a, now)) {
    return { label: "バナー掲載中", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" };
  }
  return null;
}

export function AnnouncementsManager({
  initial,
  nowMs,
}: {
  initial: AnnouncementRecord[];
  /** サーバー現在時刻(epoch ms)。掲載状況バッジの判定に使う（refresh で更新）。 */
  nowMs: number;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [pending, setPending] = useState(false);

  const now = nowMs;

  const openNew = () => {
    setForm(emptyForm());
    setEditingId("new");
  };
  const openEdit = (a: AnnouncementRecord) => {
    setForm(toForm(a));
    setEditingId(a.id);
  };
  const cancel = () => setEditingId(null);

  const save = async () => {
    if (pending) return;
    if (!form.message.trim()) {
      toast.error("タイトルを入力してください");
      return;
    }
    // 公開日時が空欄なら今すぐ公開（＝現在時刻）。
    const publishAtIso = localInputToIso(form.publishAt) ?? new Date().toISOString();
    setPending(true);
    try {
      const payload = {
        type: form.type,
        message: form.message.trim(),
        detail: form.detail.trim() || null,
        publishAt: publishAtIso,
        pinnedUntil: localInputToIso(form.pinnedUntil),
      };
      const url =
        editingId === "new"
          ? "/api/v1/admin/announcements"
          : `/api/v1/admin/announcements/${editingId}`;
      const res = await fetch(url, {
        method: editingId === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(formatErrorMessage(await parseApiError(res)));
        return;
      }
      toast.success(editingId === "new" ? "作成しました" : "更新しました");
      setEditingId(null);
      router.refresh();
    } catch {
      toast.error("保存に失敗しました");
    } finally {
      setPending(false);
    }
  };

  const remove = async (a: AnnouncementRecord) => {
    if (
      !(await confirm({
        title: "お知らせを削除",
        description: "このお知らせを削除しますか？この操作は取り消せません。",
        confirmText: "削除する",
        destructive: true,
      }))
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/admin/announcements/${a.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("削除に失敗しました");
        return;
      }
      toast.success("削除しました");
      router.refresh();
    } catch {
      toast.error("削除に失敗しました");
    }
  };

  return (
    <div className="space-y-6">
      {editingId === null && (
        <div className="flex justify-end">
          <Button type="button" onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" />
            新規作成
          </Button>
        </div>
      )}

      {editingId !== null && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold">
            {editingId === "new" ? "お知らせを新規作成" : "お知らせを編集"}
          </h2>

          <div className="space-y-1.5">
            <Label>重要度</Label>
            <SegmentControl<AnnouncementType>
              value={form.type}
              options={ANNOUNCEMENT_TYPES}
              onChange={(type) =>
                setForm((f) => ({
                  ...f,
                  type,
                  // low はバナーに出ないため掲載終了日時は無効。切替時にクリア。
                  pinnedUntil: type === "low" ? "" : f.pinnedUntil,
                }))
              }
              renderOption={(t) => (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <AnnouncementTypeIcon type={t} className="h-4 w-4" />
                  {announcementTypeLabel(t)}
                </span>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ann-message">タイトル</Label>
            <Input
              id="ann-message"
              value={form.message}
              onChange={(e) =>
                setForm((f) => ({ ...f, message: e.target.value }))
              }
              placeholder="○○をリリースしました！"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ann-detail">
              詳細本文
            </Label>
            <Textarea
              id="ann-detail"
              value={form.detail}
              onChange={(e) =>
                setForm((f) => ({ ...f, detail: e.target.value }))
              }
              rows={6}
              placeholder={"○○をリリースしました。\n詳しくは [テキスト](URL) を参照！"}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ann-publish">公開日時（任意）</Label>
              <Input
                id="ann-publish"
                type="datetime-local"
                value={form.publishAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, publishAt: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                空欄は即時公開。未来の日時を入れることで予約投稿になります。
              </p>
            </div>
            {form.type !== "low" && (
              <div className="space-y-1.5">
                <Label htmlFor="ann-pinned">バナー掲載終了日時（任意）</Label>
                <Input
                  id="ann-pinned"
                  type="datetime-local"
                  value={form.pinnedUntil}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pinnedUntil: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  空欄は公開日から7日後が自動設定。日時を入れるとその時刻まで掲載。
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={cancel}
              disabled={pending}
            >
              キャンセル
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {editingId === "new" ? "作成する" : "保存する"}
            </Button>
          </div>
        </div>
      )}

      {initial.length === 0 ? (
        <p className="rounded-md border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          お知らせはまだありません。
        </p>
      ) : (
        <ul className="divide-y border-t border-b">
          {initial.map((a) => {
            const badge = statusBadge(a, now);
            return (
              <li
                key={a.id}
                className="flex items-start gap-3 py-3"
              >
                <AnnouncementTypeIcon
                  type={a.type}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{a.message}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>
                      公開{" "}
                      {formatAnnouncementDate(a.publishAt, { withYear: true })}
                      {a.pinnedUntil
                        ? ` ・ バナー終了 ${formatAnnouncementDate(a.pinnedUntil, { withYear: true })}`
                        : ""}
                    </span>
                    {badge && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {a.detail && isPublished(a, now) && (
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={`/announcements/${a.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="詳細ページを開く"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(a)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(a)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
