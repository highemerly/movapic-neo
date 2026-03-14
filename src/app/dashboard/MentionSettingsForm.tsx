"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

const VISIBILITY_OPTIONS = ["public", "unlisted", "local"] as const;

type Visibility = typeof VISIBILITY_OPTIONS[number];

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
        投稿用のBotアカウント（
        <a
          href={botProfileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          @{botAcct}
        </a>
        ）にメンションで画像を送信するだけで、数分後にコメントを合成した写真が投稿されます。
      </p>

      <div className="text-sm space-y-3">
        <p className="font-medium">投稿の形式:</p>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>
            <strong>本文:</strong> 画像に入れるテキスト（〜140文字）
          </li>
          <li>
            <strong>添付:</strong> 画像ファイル1枚
          </li>
        </ul>
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <code className="block text-xs bg-background p-2 rounded border">
            @{botAcct} マックチキン！
          </code>
          <a
            href={`https://${userInstanceDomain}/share?text=${encodeURIComponent(`@${botAcct} マックチキン！`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-primary hover:underline"
          >
            → {userInstanceDomain}で投稿画面を開く
          </a>
        </div>
      </div>

      <div className="text-sm space-y-3">
        <p className="font-medium">オプション:</p>
        <p className="text-muted-foreground">本文の前に [上 赤 大] のように角括弧で指定できます。</p>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>
            <strong>位置:</strong> 上 下 左 右
          </li>
          <li>
            <strong>色:</strong> 白 赤 青 緑 黄 茶 桃 橙
          </li>
          <li>
            <strong>サイズ:</strong> 小 中 大 特大
          </li>
          <li>
            <strong>フォント:</strong> ふい字 ゴシック ラノベ
          </li>
          <li>
            <strong>アレンジ:</strong> ネオン ハンコ
          </li>
          <li>
            <strong>公開範囲:</strong> public unlisted
          </li>
        </ul>
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <code className="block text-xs bg-background p-2 rounded border">
            @{botAcct} [右 赤 ネオン] マックチキン！
          </code>
          <a
            href={`https://${userInstanceDomain}/share?text=${encodeURIComponent(`@${botAcct} [右 赤 ネオン] マックチキン！`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-primary hover:underline"
          >
            → {userInstanceDomain}で投稿画面を開く
          </a>
        </div>
      </div>

      <details className="border-t pt-4">
        <summary className="text-sm font-medium cursor-pointer hover:text-primary transition-colors">
          Bot投稿のデフォルト設定
        </summary>

        <div className="mt-4 space-y-4">
          {/* 投稿先の選択 */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{userInstanceDomain}への同時投稿</p>
            <div className="space-y-2">
              {VISIBILITY_OPTIONS.map((v) => (
                <label
                  key={v}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    visibility === v
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={v}
                    checked={visibility === v}
                    onChange={(e) => setVisibility(e.target.value as Visibility)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    visibility === v ? "border-primary" : "border-muted-foreground"
                  }`}>
                    {visibility === v && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="text-sm">
                    {v === "local"
                      ? "しない"
                      : v === "public"
                        ? "する（公開）"
                        : "する（非収載）"}
                  </p>
                </label>
              ))}
            </div>
          </div>

          {/* 元投稿を残すオプション */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{userInstanceDomain}の元投稿</p>
            <label className="flex items-center justify-between gap-4 p-3 cursor-pointer">
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  元投稿を残す
                  <span className="ml-2 text-xs text-muted-foreground">（非推奨）</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  元画像が添付されているBot宛投稿は、通常は不要なので、自動で削除されます。このオプションが有効な場合に限り、削除せずに残します。
                </p>
              </div>
              <div className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
                keep ? "bg-primary" : "bg-muted"
              }`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  keep ? "translate-x-6" : "translate-x-1"
                }`} />
              </div>
              <input
                type="checkbox"
                checked={keep}
                onChange={(e) => setKeep(e.target.checked)}
                className="sr-only"
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              size="sm"
            >
              {isSaving ? "保存中..." : "設定を保存"}
            </Button>
            {error && <span className="text-sm text-destructive">{error}</span>}
            {success && <span className="text-sm text-green-600">保存しました</span>}
          </div>
        </div>
      </details>
    </div>
  );
}
