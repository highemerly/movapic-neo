import type { BotStreamStatus, StreamHealthState } from "@/lib/mention/streamStatus";

/**
 * /create/bot に出す、メンション受信（bot streaming）の簡易稼働状況カード。
 * 同ページの説明（MentionGuide）と質感を揃えるため bg-muted のカードにする。
 * 状態色（ドット/ラベル）は /admin/stats の HealthPanel と同じ配色。運用詳細（接続先・close コード等）は出さない。
 */

const STATE_STYLE: Record<StreamHealthState, { dot: string; text: string }> = {
  ok: { dot: "bg-emerald-500", text: "text-emerald-600" },
  warn: { dot: "bg-amber-500", text: "text-amber-600" },
  down: { dot: "bg-red-500", text: "text-red-600" },
  unknown: { dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
};

export function BotStreamStatusCard({ status }: { status: BotStreamStatus }) {
  const s = STATE_STYLE[status.state];
  return (
    <div className="bg-muted rounded-lg p-4">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
        <p className="font-medium">Bot 稼働状況</p>
        <span className={`ml-auto shrink-0 text-xs font-semibold ${s.text}`}>{status.label}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{status.summary}</p>
    </div>
  );
}
