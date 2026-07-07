/**
 * フォントライセンス情報の一元定義。
 *
 * `/license` ページ（一覧表示）と、画像詳細ページのフォント名バッジから開くモーダル
 * （単一フォント表示）の両方が、この同じデータを共有コンポーネント FontLicenseCard で描画する。
 *
 * key は FontFamily のキー（"hui-font" 等）に一致させてある。詳細ページのフォント名
 * （image.font）から直接 FONT_LICENSES[font] で引けるようにするため。"noto-emoji" は
 * 選択可能フォントではないが、絵文字描画に使うため一覧には含める（詳細バッジからは引かれない）。
 */

export interface FontLicense {
  /** アンカー用 id ＝ FontFamily キー（"noto-emoji" のみ選択不可の特別扱い） */
  key: string;
  /** ライセンス表記上の正式名（例: "ラノベPOP V2"。UIラベル FONT_LABELS とは別物でよい） */
  label: string;
  /** 見本画像の src */
  sampleSrc: string;
  /** 見本画像の alt */
  sampleAlt: string;
  /** 著作権表記（小さめ・muted） */
  copyright: string[];
  /** ライセンス本文（説明段落） */
  body: string[];
  /** ライセンス原文などへの外部リンク */
  link?: { href: string; label: string };
  /** 補足（noto-emoji の「絵文字は全てこのフォント」等） */
  note?: string;
}

/** 表示順を保った一覧（/license ページ用）。 */
export const FONT_LICENSE_LIST: FontLicense[] = [
  {
    key: "hui-font",
    label: "ふい字",
    sampleSrc: "/font-samples/hui-font.avif",
    sampleAlt: "ふい字の見本",
    copyright: ["Copyright © ふい字置き場"],
    body: [
      "本フォントは作者による独自ライセンスのもとで配布されており、商用・非商用を問わず無料で利用できます。",
      "フォントファイルの販売および加工は禁止されています。",
    ],
  },
  {
    key: "noto-sans-jp",
    label: "Noto Sans JP",
    sampleSrc: "/font-samples/noto-sans-jp.avif",
    sampleAlt: "Noto Sans JP の見本",
    copyright: ["Copyright © 2014–2021 Adobe（「Noto」は Google Inc. の商標です）"],
    body: ["本フォントは SIL Open Font License, Version 1.1 のもとで配布されています。"],
    link: { href: "https://scripts.sil.org/OFL", label: "https://scripts.sil.org/OFL" },
  },
  {
    key: "light-novel-pop",
    label: "ラノベPOP V2",
    sampleSrc: "/font-samples/light-novel-pop.avif",
    sampleAlt: "ラノベPOP V2 の見本",
    copyright: [
      "Copyright © 2019 フロップデザイン",
      "Derived from M+ FONTS: Copyright © 2019 M+ FONTS PROJECT",
    ],
    body: ["本フォントは M+ FONTS License のもとで配布されています。"],
    link: { href: "https://booth.pm/ja/items/2328262", label: "https://booth.pm/ja/items/2328262" },
  },
  {
    key: "noto-emoji",
    label: "Noto Emoji",
    sampleSrc: "/font-samples/noto-emoji.avif",
    sampleAlt: "Noto Emoji の見本",
    copyright: ["Copyright © Google LLC"],
    body: ["本フォントは SIL Open Font License, Version 1.1 のもとで配布されています。"],
    link: { href: "https://scripts.sil.org/OFL", label: "https://scripts.sil.org/OFL" },
    note: "本サービスでは、文字に絵文字を入れると全てこのフォントで表示されます。",
  },
];

/** key 引き（詳細ページのフォント名バッジから FONT_LICENSES[image.font] で参照）。 */
export const FONT_LICENSES: Record<string, FontLicense> = Object.fromEntries(
  FONT_LICENSE_LIST.map((l) => [l.key, l])
);
