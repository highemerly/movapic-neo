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
        ）にメンションで画像を送信するだけで、数分後にコメントを合成して写真が投稿されます。
      </p>

      <div className="text-sm space-y-3">
        <p className="font-medium">投稿の形式:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>メンション先:</strong> @{botAcct}
          </li>
          <li>
            <strong>本文:</strong> 画像に入れるテキスト（〜140文字）
          </li>
          <li>
            <strong>添付:</strong> 画像ファイル1枚
          </li>
          <li>
            <strong>オプション:</strong>本文の前に [上 赤 大] のように角括弧で入力できます
          </li>
        </ul>
      </div>

      {/* サンプル投稿 */}
      <div className="text-sm space-y-3">
        <p className="font-medium">投稿例:</p>
        <div className="space-y-2">
          {/* シンプルな投稿 */}
          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <p className="text-xs text-muted-foreground">コメントをつけて投稿する</p>
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
          {/* オプション付き投稿 */}
          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <p className="text-xs text-muted-foreground">オプションを指定する</p>
            <code className="block text-xs bg-background p-2 rounded border">
              @{botAcct} [右 赤 ネオン] マックチキン！
            </code>
            <a
              href={`https://${userInstanceDomain}/share?text=${encodeURIComponent(`@${botAcct} [右 赤 ネオン] ここに好きな文章を入力`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-primary hover:underline"
            >
              → {userInstanceDomain}で投稿画面を開く
            </a>
          </div>
        </div>
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

      <div className="border-t pt-4 space-y-4">
        <p className="text-sm font-medium">Bot投稿時の設定</p>

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
        <label className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
          keep ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
        }`}>
          <div>
            <p className="text-sm font-medium">
              元投稿を残す
              <span className="ml-2 text-xs text-muted-foreground">（非推奨）</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Bot宛のメンション投稿を削除せずに残します
            </p>
          </div>
          <div className={`relative w-11 h-6 rounded-full transition-colors ${
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
    </div>
  );
}
