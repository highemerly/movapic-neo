/** admin 共通の細かな表示ヘルパ・クラス定数（テーブルのデザイン統一） */

const JST = { timeZone: "Asia/Tokyo" } as const;

/** 日時を JST で整形（null は —） */
export function fmt(d: Date | null | undefined): string {
  return d ? d.toLocaleString("ja-JP", JST) : "—";
}

/** 日付のみ JST で整形 */
export function fmtDate(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("ja-JP", JST) : "—";
}

/** バイト数を人間可読な単位（B〜TB・1024進）で整形 */
export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const val = bytes / 1024 ** i;
  const digits = i === 0 || val >= 100 ? 0 : 1;
  return `${val.toFixed(digits)} ${units[i]}`;
}

/** データが無いときのプレースホルダ枠 */
export function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** テーブル外枠（横スクロール可・最小幅指定） */
export function TableWrap({
  minWidth = "32rem",
  children,
}: {
  minWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-sm"
        style={{ minWidth }}
      >
        {children}
      </table>
    </div>
  );
}

/** テーブル見出し行の共通クラス（右寄せ・小さめ・下線） */
export const theadRowCls =
  "border-b border-border text-right text-xs text-muted-foreground";
export const theadRowLeftCls =
  "border-b border-border text-left text-xs text-muted-foreground";
