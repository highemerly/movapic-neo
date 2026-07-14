// 幅のバリエーション。Tailwind JIT が拾えるよう完全なクラス名リテラルで保持する。
const MAX_WIDTH = {
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "6xl": "max-w-6xl",
} as const;

/**
 * 各ページ共通のコンテンツコンテナ。
 * 上下・左右パディング（pt-3 / pb-8 / px-4）と中央寄せをここで一元管理し、
 * 全ページで戻るリンク・本文が同じ位置・余白から始まるようにする。
 * ページ側で余白を書かず、幅だけ width（xl / 2xl / 6xl）で切り替える。
 * 要素は <main>（ページ本文の landmark）。
 */
export function PageContainer({
  children,
  width = "2xl",
}: {
  children: React.ReactNode;
  width?: keyof typeof MAX_WIDTH;
}) {
  return (
    <main className={`container mx-auto px-4 pt-4 pb-10 ${MAX_WIDTH[width]}`}>
      {children}
    </main>
  );
}
