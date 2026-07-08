/**
 * 管理ページ: システム情報（/admin/system）
 *
 * ソフトウェアのバージョンと DB / ストレージの容量を出す読み取り専用ページ。
 * 管理者ガードは admin/layout.tsx に集約。詳細な取得方針は src/lib/admin/system.ts のコメント参照。
 */

import { getSystemInfo } from "@/lib/admin/system";
import { StatCard } from "../_components/StatCard";
import { TableWrap, theadRowLeftCls, fmtBytes } from "../_components/ui";

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  const info = await getSystemInfo();

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">システム情報</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        稼働環境のソフトウェアバージョンと容量。リロードで最新化されます。
      </p>

      {/* 容量 */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-bold">容量</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="データベース容量" value={fmtBytes(info.dbSizeBytes)} />
          <StatCard
            label="ストレージ概算"
            value={fmtBytes(info.storageApproxBytes)}
            hint="本体画像の合計・概算"
          />
          <StatCard label="保存画像数" value={info.imageCount} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          ストレージ容量は保存画像の file_size 合計による概算です（サムネイル・一時ファイルは含みません）。
        </p>
      </section>

      {/* バージョン */}
      <section>
        <h2 className="mb-3 text-xl font-bold">ソフトウェアバージョン</h2>
        <TableWrap minWidth="24rem">
          <thead>
            <tr className={theadRowLeftCls}>
              <th className="py-2 pr-4 font-medium">ソフトウェア</th>
              <th className="py-2 font-medium">バージョン</th>
            </tr>
          </thead>
          <tbody>
            {info.software.map((s) => (
              <tr key={s.name} className="border-b border-border/60">
                <td className="py-2 pr-4">{s.name}</td>
                <td className="py-2 font-mono tabular-nums">{s.version}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <p className="mt-2 text-xs text-muted-foreground">
          Node.js と PostgreSQL は実行時の実値、その他は package.json 記載のバージョンです。
        </p>
      </section>
    </>
  );
}
