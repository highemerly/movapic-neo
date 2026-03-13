"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

// 公開範囲のラベル（投稿ページと同じ）
const VISIBILITY_LABELS: Record<string, string> = {
  public: "公開",
  unlisted: "非収載",
  local: "なし",
};

const VISIBILITY_OPTIONS = ["public", "unlisted", "local"] as const;

type Visibility = typeof VISIBILITY_OPTIONS[number]["value"];

interface MentionSettingsFormProps {
  initialVisibility: Visibility;
  initialKeep: boolean;
  botAcct: string;
  userInstanceDomain: string;
}

export function MentionSettingsForm({
  initialVisibility,
  initialKeep,
  botAcct,
  userInstanceDomain,
}: MentionSettingsFormProps) {
  const router = useRouter();
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [keep, setKeep] = useState(initialKeep);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasChanges = visibility !== initialVisibility || keep !== initialKeep;

  // botAcctからユーザーページURLを生成
  // botAcct: "pic@handon.club" -> "https://handon.club/@pic"
  const botProfileUrl = (() => {
    const [username, domain] = botAcct.split("@");
    return `https://${domain}/@${username}`;
  })();

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mentionVisibility: visibility, mentionKeep: keep }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "保存に失敗しました");
      }

      setSuccess(true);
      router.refresh();
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Botアカウント（
        <a
          href={botProfileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          @{botAcct}
        </a>
        ）にメンションで画像を送信すると、自動で合成して投稿できます。
      </p>

      <div className="text-sm text-muted-foreground">
        <p className="mb-2 font-medium">投稿の形式:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>メンション先:</strong> @{botAcct}
          </li>
          <li>
            <strong>本文:</strong> 画像に入れるテキスト（1〜140文字）
          </li>
          <li>
            <strong>添付:</strong> 画像ファイル（JPEG/PNG/WebP/HEIC/AVIF）1枚
          </li>
          <li>
            <strong>オプション:</strong> [上 赤 大] のように角括弧で指定
          </li>
        </ul>
      </div>

      <div className="text-sm">
        <p className="font-medium mb-2">利用可能なオプション:</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="font-medium">位置:</span> 上 下 左 右
          </div>
          <div>
            <span className="font-medium">色:</span> 白 赤 青 緑 黄 茶 桃 橙
          </div>
          <div>
            <span className="font-medium">サイズ:</span> 小 中 大 特大
          </div>
          <div>
            <span className="font-medium">フォント:</span> ふい字 ゴシック ラノベ
          </div>
          <div>
            <span className="font-medium">アレンジ:</span> ネオン ハンコ
          </div>
          <div>
            <span className="font-medium">公開範囲:</span> public unlisted
          </div>
          <div>
            <span className="font-medium">その他:</span> debug keep
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">デフォルト設定</p>
        <div>
          <label className="text-sm text-muted-foreground">投稿種別</label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {VISIBILITY_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v === "local"
                  ? "投稿"
                  : `投稿＋${userInstanceDomain} にも同時投稿（${VISIBILITY_LABELS[v]}）`}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={keep}
            onChange={(e) => setKeep(e.target.checked)}
            className="rounded border-input"
          />
          <span className="text-sm">Bot宛の投稿を残す（非推奨）</span>
        </label>
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          size="sm"
        >
          {isSaving ? "保存中..." : "保存"}
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
        {success && <span className="text-sm text-green-600">保存しました</span>}
      </div>
    </div>
  );
}
