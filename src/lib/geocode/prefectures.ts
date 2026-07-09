/**
 * 都道府県のメタデータ（JIS X 0402 コード順）。
 * GSI 由来の都道府県名（"北海道", "東京都" など）と一致させるため、`name` は逆ジオコーディング
 * 結果のキーと整合させてある。
 */

export interface Prefecture {
  code: string; // "01"〜"47"
  name: string; // GSI と同表記
}

export const PREFECTURES: Prefecture[] = [
  { code: "01", name: "北海道" },
  { code: "02", name: "青森県" },
  { code: "03", name: "岩手県" },
  { code: "04", name: "宮城県" },
  { code: "05", name: "秋田県" },
  { code: "06", name: "山形県" },
  { code: "07", name: "福島県" },
  { code: "08", name: "茨城県" },
  { code: "09", name: "栃木県" },
  { code: "10", name: "群馬県" },
  { code: "11", name: "埼玉県" },
  { code: "12", name: "千葉県" },
  { code: "13", name: "東京都" },
  { code: "14", name: "神奈川県" },
  { code: "15", name: "新潟県" },
  { code: "16", name: "富山県" },
  { code: "17", name: "石川県" },
  { code: "18", name: "福井県" },
  { code: "19", name: "山梨県" },
  { code: "20", name: "長野県" },
  { code: "21", name: "岐阜県" },
  { code: "22", name: "静岡県" },
  { code: "23", name: "愛知県" },
  { code: "24", name: "三重県" },
  { code: "25", name: "滋賀県" },
  { code: "26", name: "京都府" },
  { code: "27", name: "大阪府" },
  { code: "28", name: "兵庫県" },
  { code: "29", name: "奈良県" },
  { code: "30", name: "和歌山県" },
  { code: "31", name: "鳥取県" },
  { code: "32", name: "島根県" },
  { code: "33", name: "岡山県" },
  { code: "34", name: "広島県" },
  { code: "35", name: "山口県" },
  { code: "36", name: "徳島県" },
  { code: "37", name: "香川県" },
  { code: "38", name: "愛媛県" },
  { code: "39", name: "高知県" },
  { code: "40", name: "福岡県" },
  { code: "41", name: "佐賀県" },
  { code: "42", name: "長崎県" },
  { code: "43", name: "熊本県" },
  { code: "44", name: "大分県" },
  { code: "45", name: "宮崎県" },
  { code: "46", name: "鹿児島県" },
  { code: "47", name: "沖縄県" },
];

/**
 * 地図ヒートマップのタイルカルトグラム配置。13列 × 11行。各セルは prefecture code か null。
 * 厳密な地理ではなく、九州(左下)→北海道(右上)へ日本列島の形をおおまかに再現する。
 * 精度より上下左右の位置関係を優先し、各行・各列を経度/緯度順で単調になるよう配置している。
 * 沖縄を左下(01列)、北海道を右上(13列)に置いて素直に横へ広げたぶん12→13列に増えたが、
 * 上端の空行を持たない実質11行なので縦は従来(12行)より1段短い。
 * 四国は高知を1段下げて田の字（愛媛/香川/徳島の南に高知）、九州は南北3段
 * （佐賀福岡／長崎熊本大分／鹿児島宮崎）に展開して南北関係を出している。
 * 東北は青森→(秋田/岩手)→(山形/宮城)→福島 の縦並びで太平洋/日本海側を左右に分けている。
 */
export const JAPAN_TILE_GRID: (string | null)[][] = [
  [null, null, null, null, null, null, null, null, null, null, null, null, "01"],
  [null, null, null, null, null, null, null, null, null, null, null, "02", null],
  [null, null, null, null, null, null, null, null, null, null, null, "05", "03"],
  [null, null, null, null, null, null, null, null, null, null, null, "06", "04"],
  [null, null, null, null, null, null, null, null, null, null, "15", "07", null],
  [null, null, null, "32", "31", null, null, "18", "17", "16", "10", "09", "08"],
  [null, null, "35", "34", "33", "28", "26", "25", "21", "20", "19", "11", "12"],
  ["42", "41", "40", null, null, null, "27", "29", "24", "23", "22", "13", null],
  [null, "43", "44", null, "38", "37", null, "30", null, null, null, "14", null],
  [null, "46", "45", null, "39", "36", null, null, null, null, null, null, null],
  ["47", null, null, null, null, null, null, null, null, null, null, null, null],
];

export const PREFECTURE_BY_CODE: Record<string, Prefecture> = Object.fromEntries(
  PREFECTURES.map((p) => [p.code, p])
);
