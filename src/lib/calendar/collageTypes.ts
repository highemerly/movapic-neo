/**
 * カレンダー画像（コラージュ）生成の入出力型。
 *
 * worker-front（client.ts）と compute（calendarCollage.ts）の両方が参照するため、
 * skia/sharp に依存しない純粋な型だけをここに置く。
 */

/** 配色テーマ。light=温かみのある紙色 / dark=暗い紙色。未指定は light 相当。 */
export type CollageTheme = "light" | "dark";

/** グリッドの1セル（投稿のある日・穴埋めされた日のみ）。空き日は cells に含めない。 */
export interface CalendarCell {
  /** 日(1-31)。穴埋めセルではこれが「埋められた空き日（穴の日）」。 */
  day: number;
  /** post=その日の代表サムネ / makeup=穴埋めした donor のサムネ。 */
  kind: "post" | "makeup";
  /** 添付サムネ配列（thumbnails）のインデックス。 */
  imageIndex: number;
  /** makeup のとき、その穴を実際に埋めた投稿日(1-31)。日付を打ち消して併記する。 */
  filledBy?: number;
}

export interface CalendarCollageSpec {
  year: number;
  month: number;
  /** ウォーターマークのサービス名（"SHAMEZO"）。 */
  serviceName: string;
  /** ウォーターマークに併記するアプリのドメイン（例: "pic.handon.club"・scheme無し）。 */
  appDomain: string;
  /** 著作権表記のハンドル（例: "alice@handon.club"）。© は描画側で付ける（Noto から拾う）。 */
  authorHandle: string;
  /** 皆勤月なら true（ヘッダーに👑を出す）。 */
  isPerfect: boolean;
  /** その月の祝日の日(1-31)一覧。日曜と同じ赤系で色付けする。 */
  holidays: number[];
  /** 配色テーマ（未指定は light）。 */
  theme?: CollageTheme;
  cells: CalendarCell[];
}
