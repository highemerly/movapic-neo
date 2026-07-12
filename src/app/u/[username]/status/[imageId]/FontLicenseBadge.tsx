"use client";

import type { ReactNode } from "react";
import { Type, Smile } from "lucide-react";
import { FONT_LABELS, type FontFamily } from "@/types";
import { FONT_LICENSES, type FontLicense } from "@/lib/fonts/licenses";
import { FontLicenseDialog } from "@/components/fonts/FontLicenseDialog";

/** アイコン＋ラベルのライセンスバッジ。license があればクリックでモーダル表示。 */
function LicenseBadge({
  icon,
  label,
  license,
  title,
}: {
  icon: ReactNode;
  label: string;
  license: FontLicense | undefined;
  title: string;
}) {
  const content = (
    <>
      {icon}
      {label}
    </>
  );

  if (!license) {
    return <span className="inline-flex items-center gap-0">{content}</span>;
  }

  return (
    <FontLicenseDialog
      license={license}
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-0 -my-1 py-1 hover:text-foreground transition-colors"
          title={title}
        >
          {content}
        </button>
      }
    />
  );
}

/**
 * 詳細ページのメタ情報行に出すフォント名バッジ。クリックでライセンスをモーダル表示。
 *
 * `font` は image.font（DBのスタイル列）を渡す。シーズン投稿でも生成時のプリセット
 * フォント（seasonDef.preset.font）がこの列に保存されるため、シーズンでも同じ経路で
 * フォント名・ライセンスを表示できる。想定外の未知フォントはプレーン表示に落とす。
 *
 * `hasEmoji`（本文に絵文字を含む）が true のときは、本文フォントに関わらず絵文字が
 * Noto Emoji で描画される旨を「😀 Noto Emoji」バッジで別立て表示する。
 *
 * `hasNonEmojiText`（絵文字以外の文字を含む）が false＝テキストが絵文字だけのときは、
 * 本文フォント（ふい字等）は描画に使われないため本文フォントバッジを表示しない。
 * 省略時は後方互換で常に表示。
 */
export function FontLicenseBadge({
  font,
  hasEmoji,
  hasNonEmojiText = true,
}: {
  font: string;
  hasEmoji?: boolean;
  hasNonEmojiText?: boolean;
}) {
  const label = FONT_LABELS[font as FontFamily] ?? font;

  return (
    <>
      {hasNonEmojiText && (
        <LicenseBadge
          icon={<Type className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          label={label}
          license={FONT_LICENSES[font]}
          title="フォントライセンス"
        />
      )}
      {hasEmoji && (
        <LicenseBadge
          icon={<Smile className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          label="Noto Emoji"
          license={FONT_LICENSES["noto-emoji"]}
          title="絵文字は Noto Emoji で表示されます"
        />
      )}
    </>
  );
}
