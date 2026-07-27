import { Share, SquarePlus, MoreHorizontal, type LucideIcon } from "lucide-react";

/**
 * アイコンと直後の数文字を1かたまりにして、アイコンの直後で改行されないようにする
 * （アイコンだけが行末に取り残されると、何の操作を指しているのか読み取れなくなる）。
 */
function IconLead({
  icon: Icon,
  label,
  lead,
}: {
  icon: LucideIcon;
  label: string;
  lead: string;
}) {
  return (
    <span className="whitespace-nowrap">
      <Icon className="mr-1 inline-block h-4 w-4 align-text-bottom" aria-label={label} />
      {lead}
    </span>
  );
}

// アイコンは行頭に置く（＝改行はアイコンの「前」だけで起こる）ため、複数行の手順は
// flex-col で行を分ける。
const STEPS: { body: React.ReactNode }[] = [
  {
    body: (
      <span className="flex flex-col gap-1">
        <span>
          （<IconLead icon={Share} label="共有" lead="共有" />
          が表示されていない場合）
        </span>
        <span>
          <IconLead icon={MoreHorizontal} label="メニュー" lead="Safariの" />
          メニューボタンをタップします。
        </span>
      </span>
    ),
  },
  {
    body: (
      <span>
        <IconLead icon={Share} label="共有" lead="共有" />
        をタップします。
      </span>
    ),
  },
  {
    body: (
      <span className="flex flex-col gap-1">
        <span>下にスクロールし、</span>
        <span>
          <IconLead icon={SquarePlus} label="ホーム画面に追加" lead="ホーム画面" />
          に追加をタップします。
        </span>
      </span>
    ),
  },
  {
    body: <span>右上の「追加」をタップして完了です。</span>,
  },
];

/**
 * iOS Safari の「ホーム画面に追加」手順。
 * 手順ページ（/settings/install）と投稿後の提案モーダル（[InstallSuggestModal]）で共用する。
 */
export function IosInstallSteps({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={compact ? "space-y-2" : "space-y-3"}>
      {STEPS.map((step, i) => (
        <li
          key={i}
          className={`flex items-start gap-3 rounded-lg bg-muted ${
            compact ? "p-3 text-xs" : "p-4 text-sm"
          }`}
        >
          <span
            className={`flex flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ${
              compact ? "h-5 w-5" : "h-6 w-6"
            }`}
          >
            {i + 1}
          </span>
          {step.body}
        </li>
      ))}
    </ol>
  );
}
