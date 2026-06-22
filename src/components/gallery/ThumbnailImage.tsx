import { RetryImage } from "@/components/gallery/RetryImage";

interface ThumbnailImageProps {
  src: string;
  alt: string;
  position?: string;
  /** 文字サイズ。grid 表示の拡大率を出し分けるのに使う（fill では無視） */
  size?: string;
  className?: string;
  loading?: "lazy" | "eager";
  /**
   * トリミングなし表示。親要素のサイズ（画像と同じアスペクト比の枠）に
   * そのまま収める。aspect-square・拡大・位置クロップを行わない。
   */
  fill?: boolean;
}

// grid 表示の拡大率を文字サイズで出し分ける。
// 小ほど強く・大きいほど弱く拡大して、表示文字サイズの差を圧縮する
// （順序は 小 < 中 < 大 < 特大 を維持）。タイルを埋めるため拡大率は 1.0 以上。
// Tailwind は動的な任意値を生成しないため、リテラルのクラス文字列で持つ。
const GRID_SCALE_CLASS: Record<string, string> = {
  small: "scale-[1.4]",
  medium: "scale-[1.25]",
  large: "scale-[1.1]",
  "extra-large": "scale-[1.0]",
};

function gridScaleClass(size?: string): string {
  return GRID_SCALE_CLASS[size ?? "medium"] ?? "scale-[1.25]";
}

// 文字位置に応じたobject-positionとtransform-originを返す
// 文字が配置されている角を基準に拡大表示
function getPositionClasses(position: string): string {
  switch (position) {
    case "top":
      return "object-left-top origin-top-left";
    case "bottom":
      return "object-left-bottom origin-bottom-left";
    case "left":
      return "object-left-top origin-top-left";
    case "right":
      return "object-right-top origin-top-right";
    default:
      return "object-center origin-center";
  }
}

export function ThumbnailImage({
  src,
  alt,
  position = "top",
  size,
  className = "",
  loading = "lazy",
  fill = false,
}: ThumbnailImageProps) {
  // fill: 親の枠（画像と同比率）にそのまま収める＝実質トリミングなし。
  // 既定: 正方形にクロップ（拡大＋文字位置基準）。
  const containerClass = fill
    ? "h-full w-full overflow-hidden"
    : "aspect-square w-full overflow-hidden";
  const imgClass = fill
    ? "absolute inset-0 h-full w-full object-cover"
    : `absolute inset-0 h-full w-full ${gridScaleClass(size)} object-cover ${getPositionClasses(position)}`;

  // 原本をCSSで縮小表示している（/public・/favorite は意図的にフル画像）。
  // 重い原本は iOS Safari で一過性に読み込み失敗するため RetryImage で自動再取得する。
  return (
    <RetryImage
      src={src}
      alt={alt}
      loading={loading}
      containerClassName={containerClass}
      imgClassName={`${imgClass} ${className}`}
    />
  );
}
