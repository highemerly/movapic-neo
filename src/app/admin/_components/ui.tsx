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
