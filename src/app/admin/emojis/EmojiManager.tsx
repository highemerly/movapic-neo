"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Eye, EyeOff, Pencil, Check, X, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RetryImg } from "@/components/RetryImg";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { NativeSelect } from "@/app/admin/_components/NativeSelect";
import { parseApiError, formatErrorMessage } from "@/lib/errors";

export type AdminEmoji = {
  id: string;
  name: string;
  imageUrl: string;
  category: string | null;
  aliases: string[];
  license: string | null;
  enabled: boolean;
  createdById: string | null;
  createdAt: string;
};

type FormState = {
  name: string;
  category: string;
  aliases: string;
  license: string;
  file: File | null;
};

function emptyForm(): FormState {
  return { name: "", category: "", aliases: "", license: "", file: null };
}

// カテゴリ絞り込みの値。カテゴリ名は管理者が自由に付けられるため、擬似項目
// （すべて／未分類）と衝突しないよう接頭辞付きのキーにする。
const FILTER_ALL = "all";
const FILTER_UNCATEGORIZED = "none";
const categoryFilterValue = (category: string) => `c:${category}`;
const UNCATEGORIZED_LABEL = "その他";

// ファイル名からショートコードの許可文字（英数字・_ + -）だけを残した候補を作る
function shortcodeFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  return base.replace(/[^A-Za-z0-9_+-]/g, "_").replace(/^_+|_+$/g, "");
}

export function EmojiManager({ initial }: { initial: AdminEmoji[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [pending, setPending] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 一覧行のカテゴリ・エイリアス・ライセンス後編集。編集中の行 id と入力値を保持する
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    category: "",
    aliases: "",
    license: "",
  });
  const [editPending, setEditPending] = useState(false);

  // 一覧の絞り込み（カテゴリ・ショートコード検索）。登録フォームの候補（datalist）は
  // 絞り込みの影響を受けないよう常に全件から作る（既存カテゴリが候補から消えるのを防ぐ）。
  const [categoryFilter, setCategoryFilter] = useState<string>(FILTER_ALL);
  const [query, setQuery] = useState("");

  // 既存カテゴリ（プルダウン候補）。手入力も許すため datalist で提示する
  const categoryOptions = Array.from(
    new Set(initial.map((e) => e.category?.trim()).filter((c): c is string => !!c)),
  ).sort();

  // カテゴリ名が「すべて」等と衝突しないよう、フィルタ値は接頭辞付きキーで持つ
  const hasUncategorized = initial.some((e) => !e.category?.trim());
  const filterOptions: string[] = [
    FILTER_ALL,
    ...categoryOptions.map(categoryFilterValue),
    ...(hasUncategorized ? [FILTER_UNCATEGORIZED] : []),
  ];
  // 選択中カテゴリの絵文字を全部消す/付け替えると選択値が候補から消えるため、その場合は
  // 「すべて」に戻す（一覧が空のまま操作不能になるのを防ぐ）。
  const activeFilter = filterOptions.includes(categoryFilter)
    ? categoryFilter
    : FILTER_ALL;
  // ショートコードは英数字のみなので、コロン付き（`:name:`）で貼られても拾えるよう剥がして比較
  const normalizedQuery = query.trim().replace(/^:+|:+$/g, "").toLowerCase();
  const visible = initial.filter((e) => {
    const category = e.category?.trim() ?? "";
    const matchesCategory =
      activeFilter === FILTER_ALL
        ? true
        : activeFilter === FILTER_UNCATEGORIZED
          ? category === ""
          : categoryFilterValue(category) === activeFilter;
    return (
      matchesCategory &&
      (normalizedQuery === "" || e.name.toLowerCase().includes(normalizedQuery))
    );
  });

  const onPickFile = (file: File | null) => {
    setForm((f) => ({
      ...f,
      file,
      // ショートコードが未入力のときだけファイル名から補完（入力済みは尊重）
      name: f.name.trim() || !file ? f.name : shortcodeFromFileName(file.name),
    }));
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
      toast.error("ショートコードを入力してください");
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
      body.set("license", form.license.trim());
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

  const startEdit = (e: AdminEmoji) => {
    setEditingId(e.id);
    setEditForm({
      category: e.category ?? "",
      aliases: e.aliases.join(", "),
      license: e.license ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (e: AdminEmoji) => {
    if (editPending) return;
    setEditPending(true);
    try {
      const res = await fetch(`/api/v1/admin/emojis/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: editForm.category.trim(),
          aliases: editForm.aliases.trim(),
          license: editForm.license.trim(),
        }),
      });
      if (!res.ok) {
        toast.error(formatErrorMessage(await parseApiError(res)));
        return;
      }
      toast.success("更新しました");
      setEditingId(null);
      router.refresh();
    } catch {
      toast.error("更新に失敗しました");
    } finally {
      setEditPending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 登録フォーム */}
      <div className="space-y-4 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold">絵文字を登録</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="emoji-name">ショートコード</Label>
            <Input
              id="emoji-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="shamezo_wktk"
            />
            <p className="text-xs text-muted-foreground">
              英数字・_ + - のみ
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emoji-category">カテゴリ（任意）</Label>
            <Input
              id="emoji-category"
              list="emoji-category-options"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="表情"
            />
            <datalist id="emoji-category-options">
              {categoryOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
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
          <Label htmlFor="emoji-license">ライセンス（任意）</Label>
          <Input
            id="emoji-license"
            value={form.license}
            onChange={(e) => setForm((f) => ({ ...f, license: e.target.value }))}
            placeholder="出典・利用条件など"
          />
          <p className="text-xs text-muted-foreground">
            素材の出典や利用条件を自由記述で残せます。
          </p>
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
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* カテゴリ選択はカテゴリが2種類以上あるときだけ（1種類なら選ぶ意味がない） */}
            {filterOptions.length > 2 && (
              <NativeSelect
                value={activeFilter}
                onChange={(ev) => setCategoryFilter(ev.target.value)}
                aria-label="カテゴリで絞り込み"
                className="h-9"
              >
                <option value={FILTER_ALL}>すべてのカテゴリ</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={categoryFilterValue(c)}>
                    {c}
                  </option>
                ))}
                {hasUncategorized && (
                  <option value={FILTER_UNCATEGORIZED}>{UNCATEGORIZED_LABEL}</option>
                )}
              </NativeSelect>
            )}
            <div className="relative min-w-40 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(ev) => setQuery(ev.target.value)}
                placeholder="ショートコードで検索"
                aria-label="ショートコードで検索"
                className="pl-8"
              />
            </div>
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {visible.length} 件
            </p>
          </div>
          {visible.length === 0 ? (
            <p className="rounded-md border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              該当する絵文字はありません。
            </p>
          ) : (
            <ul className="divide-y border-t border-b">
              {visible.map((e) => (
                <li key={e.id} className="py-3">
                  <div className="flex items-center gap-3">
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
                        {e.category ?? UNCATEGORIZED_LABEL}
                        {e.aliases.length > 0 ? ` ・ ${e.aliases.join(", ")}` : ""}
                      </p>
                      {e.license && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          ライセンス: {e.license}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => (editingId === e.id ? cancelEdit() : startEdit(e))}
                        aria-label={
                          editingId === e.id
                            ? "編集をやめる"
                            : "カテゴリ・エイリアス・ライセンスを編集"
                        }
                      >
                        {editingId === e.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                      </Button>
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
                  </div>

                  {editingId === e.id && (
                    <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/30 p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-category-${e.id}`}>カテゴリ</Label>
                          <Input
                            id={`edit-category-${e.id}`}
                            list="emoji-category-options"
                            value={editForm.category}
                            onChange={(ev) =>
                              setEditForm((f) => ({ ...f, category: ev.target.value }))
                            }
                            placeholder="表情"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-aliases-${e.id}`}>
                            エイリアス（カンマ区切り）
                          </Label>
                          <Input
                            id={`edit-aliases-${e.id}`}
                            value={editForm.aliases}
                            onChange={(ev) =>
                              setEditForm((f) => ({ ...f, aliases: ev.target.value }))
                            }
                            placeholder="わくわく, ワクワク"
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label htmlFor={`edit-license-${e.id}`}>ライセンス</Label>
                          <Input
                            id={`edit-license-${e.id}`}
                            value={editForm.license}
                            onChange={(ev) =>
                              setEditForm((f) => ({ ...f, license: ev.target.value }))
                            }
                            placeholder="出典・利用条件など"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                          キャンセル
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => saveEdit(e)}
                          disabled={editPending}
                        >
                          <Check className="mr-1.5 h-4 w-4" />
                          保存
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
