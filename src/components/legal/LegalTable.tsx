/**
 * 規約・ポリシーの中に置く小さな表（Cookie 名や保存領域のキーの一覧）。
 *
 * 狭い画面では表だけを横に流す。表は列数ぶんの最小幅を持つので、何もしないと本文ごと
 * 横スクロールし（モーダルでは枠からはみ出し）、行の頭が画面外へ出る。
 *
 * 中身は文字列で受ける。JSX で表を組ませない — 同じ表を2つ書けば罫線の付け方が必ずずれるし、
 * 横スクロールの囲いを片方だけ忘れる。1列目は綴りをそのまま写す値（名前・キー）なので等幅にする。
 */
export function LegalTable({
  head,
  rows,
  caption,
}: {
  head: string[];
  rows: string[][];
  /** 読み上げ用の表の名前。画面には出さない */
  caption: string;
}) {
  return (
    <div className="overflow-x-auto">
      {/* 親の overflow-wrap:anywhere を切る。効いたままだと Cookie 名が升目の中で1文字ずつ折れる */}
      <table className="w-full min-w-xl border-collapse text-sm [overflow-wrap:normal]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-background/60">
            {head.map((cell) => (
              <th
                key={cell}
                scope="col"
                className="border border-border px-3 py-2 text-left font-medium"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, ...values]) => (
            <tr key={label}>
              {/* 1列目は行の見出し。読み上げが「◯◯は 目的 期限」と読める */}
              <th
                scope="row"
                className="border border-border px-3 py-2 text-left font-mono text-xs font-normal"
              >
                {label}
              </th>
              {values.map((cell, i) => (
                <td
                  key={i}
                  className="border border-border px-3 py-2 text-muted-foreground"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
