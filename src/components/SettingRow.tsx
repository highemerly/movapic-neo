import type React from "react";
import Link from "@/components/Link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

/**
 * 設定ページの「設定行」を1つに統一する presentational プリミティブ。
 *
 * ねらいは "誤認しづらさ"。行を link / toggle / action の3タイプに絞り、右端の
 * アフォーダンスを固定することで、その行が何をするかを見た目から予測できるようにする:
 * - link   → 右端シェブロン ＝ 別画面へ遷移
 * - toggle → 右端スイッチ   ＝ その場で即時ON/OFF
 * - action → 右端アイコン   ＝ その場で実行
 * link/toggle/action はいずれも枠付きの行。値を選ぶ項目（セグメント/入力）も SettingField で
 * 同じ枠に囲い、設定ページの全項目を枠付きで揃える。
 *
 * 以前は同じ `flex ... rounded-lg border hover:bg-muted/50` を各所（AutoMakeup /
 * Location / BlockCrawlers / Defaults / Email / Install / sessions / delete）で手書き
 * 複製しており、微妙なズレと、不可逆アクション（メール再生成）が単なる遷移リンクに
 * 見えるといった意味の混線を生んでいた。ここに一本化して差異を構造的に潰す。
 */

const ROW_BASE =
  "flex items-center justify-between gap-4 p-3 rounded-lg border transition-colors";
const ROW_HOVER = `${ROW_BASE} hover:bg-muted/50`;

function RowBody({
  title,
  description,
  tag,
  titleClassName,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  tag?: React.ReactNode;
  titleClassName?: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className={`text-sm flex items-center flex-wrap gap-x-2 ${titleClassName ?? ""}`}>
        {title}
        {tag != null && (
          <span className="text-xs font-normal text-muted-foreground">{tag}</span>
        )}
      </p>
      {description != null && (
        <div className="text-[11px] leading-relaxed text-muted-foreground mt-0.5">{description}</div>
      )}
    </div>
  );
}

/** link: 別画面へ遷移（右端＝シェブロン）。破壊的な遷移先は tone="destructive"。 */
export function SettingLinkRow({
  href,
  title,
  description,
  tone = "default",
}: {
  href: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  tone?: "default" | "destructive";
}) {
  const destructive = tone === "destructive";
  return (
    <Link
      href={href}
      className={
        destructive
          ? `${ROW_BASE} border-destructive/30 hover:bg-destructive/5`
          : ROW_HOVER
      }
    >
      <RowBody
        title={title}
        description={description}
        titleClassName={destructive ? "text-destructive" : undefined}
      />
      <ChevronRight
        className={`h-4 w-4 flex-shrink-0 ${destructive ? "text-destructive/70" : "text-muted-foreground"}`}
      />
    </Link>
  );
}

/** toggle: その場で即時ON/OFF（右端＝スイッチ）。ラベル全体がクリック領域。 */
export function SettingToggleRow({
  title,
  description,
  tag,
  checked,
  onChange,
  disabled,
  bare,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  tag?: React.ReactNode;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  /** 親の枠の中に置くとき枠線を外す（例: 初期設定保存トグル＋配下を1枠にまとめる）。 */
  bare?: boolean;
}) {
  return (
    <label
      className={
        bare
          ? "flex items-center justify-between gap-4 p-3 cursor-pointer"
          : `${ROW_HOVER} cursor-pointer`
      }
    >
      <RowBody title={title} description={description} tag={tag} />
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
    </label>
  );
}

/**
 * action: その場で実行（右端＝アクションを表すアイコン）。行全体が1つの <button>。
 * 遷移リンク（右端シェブロン）と区別できるよう、シェブロン以外のアイコン（例: ⟳）を
 * 使い、かつ「押すと何が起きるか」を description で明示する（不可逆操作の誤認防止）。
 * ラベルのピルは付けない（装飾的なボタン風UIを増やさない方針）。
 */
export function SettingActionRow({
  title,
  description,
  onClick,
  disabled,
  busy,
  icon: Icon,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** true の間は right のアイコンを回転（処理中表現）。 */
  busy?: boolean;
  icon: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${ROW_HOVER} w-full text-left disabled:opacity-60`}
    >
      <RowBody title={title} description={description} />
      <Icon
        className={`h-4 w-4 flex-shrink-0 text-muted-foreground ${busy ? "animate-spin" : ""}`}
      />
    </button>
  );
}

/**
 * ラベル＋コントロール（セグメント/入力など）を、link/toggle/action 行と同じ枠に囲う
 * フィールド。設定ページの各項目を枠付きで揃えるための入れ物。
 */
export function SettingField({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`rounded-lg border p-3 ${className ?? ""}`}>{children}</div>;
}
