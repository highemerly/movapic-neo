"use client";

interface MentionSettingsFormProps {
  botAcct: string;
  userInstanceDomain: string;
}

export function MentionSettingsForm({
  botAcct,
  userInstanceDomain,
}: MentionSettingsFormProps) {
  // botAcctからユーザーページURLを生成
  // botAcct: "pic@handon.club" -> "https://handon.club/@pic"
  const botProfileUrl = (() => {
    const [username, domain] = botAcct.split("@");
    return `https://${domain}/@${username}`;
  })();

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
    </div>
  );
}
