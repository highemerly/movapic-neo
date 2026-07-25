"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RetryImg } from "@/components/RetryImg";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { parseApiError, formatErrorMessage } from "@/lib/errors";

export type AdminEmoji = {
  id: string;
  name: string;
  imageUrl: string;
  category: string | null;
  aliases: string[];
  enabled: boolean;
  createdById: string | null;
  createdAt: string;
};

type FormState = {
  name: string;
  category: string;
  aliases: string;
  file: File | null;
};

function emptyForm(): FormState {
  return { name: "", category: "", aliases: "", file: null };
}

export function EmojiManager({ initial }: { initial: AdminEmoji[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [pending, setPending] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickFile = (file: File | null) => {
    setForm((f) => ({ ...f, file }));
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const resetForm = () => {
    setForm(emptyForm());
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const upload = async () => {
    if (pending) return;
    if (!form.name.trim()) {
      toast.error("名前を入力してください");
      return;
    }
    if (!form.file) {
      toast.error("画像を選択してください");
      return;
    }
    setPending(true);
    try {
      const body = new FormData();
      body.set("name", form.name.trim());
      body.set("category", form.category.trim());
      body.set("aliases", form.aliases.trim());
      body.set("image", form.file);
      const res = await fetch("/api/v1/admin/emojis", { method: "POST", body });
      if (!res.ok) {
        toast.error(formatErrorMessage(await parseApiError(res)));
        return;
      }
      toast.success("登録しました");
      resetForm();
      router.refresh();
    } catch {
      toast.error("登録に失敗しました");
    } finally {
      setPending(false);
    }
  };

  const toggleEnabled = async (e: AdminEmoji) => {
    try {
      const res = await fetch(`/api/v1/admin/emojis/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !e.enabled }),
      });
      if (!res.ok) {
        toast.error(formatErrorMessage(await parseApiError(res)));
        return;
      }
      toast.success(e.enabled ? "無効化しました" : "有効化しました");
      router.refresh();
    } catch {
      toast.error("更新に失敗しました");
    }
  };

  const remove = async (e: AdminEmoji) => {
    if (
      !(await confirm({
        title: "絵文字を削除",
        description: `:${e.name}: を削除しますか？この操作は取り消せません。`,
        confirmText: "削除する",
        destructive: true,
      }))
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/admin/emojis/${e.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(formatErrorMessage(await parseApiError(res)));
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
      {/* 登録フォーム */}
      <div className="space-y-4 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold">絵文字を登録</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="emoji-name">名前</Label>
            <Input
              id="emoji-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="shamezo_wktk"
            />
            <p className="text-xs text-muted-foreground">
              英数字・_ + - のみ。リアクションでは :名前: で表示されます。
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emoji-category">カテゴリ（任意）</Label>
            <Input
              id="emoji-category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="表情"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emoji-aliases">エイリアス（任意・カンマ区切り）</Label>
          <Input
            id="emoji-aliases"
            value={form.aliases}
            onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))}
            placeholder="わくわく, ワクワク"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emoji-file">画像</Label>
          <input
            id="emoji-file"
            ref={fileInputRef}
            type="file"
            accept="image/png,image/apng,image/gif,image/webp,image/jpeg,image/avif"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
          />
          <p className="text-xs text-muted-foreground">
            PNG / APNG / GIF / WebP / JPEG / AVIF（3MBまで）。横長・アニメーション可。原本のまま保存されます。
          </p>
          {previewUrl && (
            <div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- ローカルObjectURLプレビュー */}
              <img src={previewUrl} alt="プレビュー" className="h-[1.5em] w-auto" />
              <span className="text-xs text-muted-foreground">実寸プレビュー（行の高さに合わせて表示されます）</span>
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={upload} disabled={pending}>
            <Plus className="mr-1.5 h-4 w-4" />
            登録する
          </Button>
        </div>
      </div>

      {/* 一覧 */}
      {initial.length === 0 ? (
        <p className="rounded-md border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          まだ登録された絵文字はありません。
        </p>
      ) : (
        <ul className="divide-y border-t border-b">
          {initial.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-3">
              <div className="flex h-8 w-12 shrink-0 items-center justify-center">
                <RetryImg
                  src={e.imageUrl}
                  alt={`:${e.name}:`}
                  className="max-h-8 w-auto object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  :{e.name}:
                  {!e.enabled && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      無効
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {e.category ?? "その他"}
                  {e.aliases.length > 0 ? ` ・ ${e.aliases.join(", ")}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => toggleEnabled(e)}
                  aria-label={e.enabled ? "無効化" : "有効化"}
                >
                  {e.enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(e)}
                  aria-label="削除"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
