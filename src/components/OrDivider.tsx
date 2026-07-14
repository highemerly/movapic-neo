/**
 * 「または」の区切り線。複数の選択肢が並列であることを視覚的に示す。
 * 写真アップロード（ドロップゾーン ／ カメラ撮影 ／ 他の投稿方法）で共通利用する。
 */
export function OrDivider({ label = "または" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span>{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
