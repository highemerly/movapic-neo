"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

interface MentionSettingsFormProps {
  initialKeep: boolean;
  botAcct: string;
  userInstanceDomain: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function MentionSettingsForm({
  initialKeep,
  botAcct,
  userInstanceDomain,
}: MentionSettingsFormProps) {
  const router = useRouter();
  const [keep, setKeep] = useState(initialKeep);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const savedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSaving = saveState === "saving";

  // botAcctからユーザーページURLを生成
  // botAcct: "pic@handon.club" -> "https://handon.club/@pic"
  const botProfileUrl = (() => {
    const [username, domain] = botAcct.split("@");
    return `https://${domain}/@${username}`;
  })();

  const handleToggle = async () => {
    const next = !keep;
    setKeep(next);
    setSaveState("saving");
    setError(null);
    try {
      const response = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentionKeep: next }),
      });
      if (!response.ok) {
        setKeep(!next); // ロールバック
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "保存に失敗しました");
      }
      setSaveState("saved");
      router.refresh();
      if (savedClearRef.current) clearTimeout(savedClearRef.current);
      savedClearRef.current = setTimeout(() => setSaveState("idle"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setSaveState("error");
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

      <div className="text-sm space-y-3">
        <p className="font-medium">元投稿の扱い:</p>
        <p className="text-muted-foreground">
        </p>
        <label className="flex items-center justify-between gap-4 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex-1 min-w-0">
            <p className="text-sm">
              元投稿を残す
              <span className="ml-2 text-xs text-muted-foreground">（非推奨）</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Bot宛の元投稿は通常不要なので、デフォルトでは自動で削除されます。ただし、このオプションを有効にすれば、元投稿を削除せずに残すこともできます。
            </p>
          </div>
          <div className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
            keep ? "bg-primary" : "bg-muted"
          } ${isSaving ? "opacity-60" : ""}`}>
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              keep ? "translate-x-6" : "translate-x-1"
            }`} />
          </div>
          <input
            type="checkbox"
            checked={keep}
            onChange={handleToggle}
            disabled={isSaving}
            className="sr-only"
          />
        </label>

        <div className="flex items-center gap-2 px-3 text-xs min-h-4">
          {saveState === "saving" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">保存中...</span>
            </>
          )}
          {saveState === "saved" && (
            <>
              <Check className="h-3 w-3 text-green-600" />
              <span className="text-green-600">保存しました</span>
            </>
          )}
          {saveState === "error" && error && (
            <span className="text-destructive">{error}</span>
          )}
        </div>
      </div>
    </div>
  );
}
