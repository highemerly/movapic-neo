import { CornerUpLeft } from "lucide-react";
import Link from "@/components/Link";
import { RetryImage } from "@/components/gallery/RetryImage";
import { AltTextReveal } from "@/components/AltTextReveal";
import { navImageHref, navImageUserSegment, navImageSelect, type NavImage } from "./navImage";

/** 画像詳細に出すリプライの上限。超えたら「ほかにもあります」とだけ出す（ページングは作らない）。 */
export const THREAD_REPLIES_LIMIT = 30;

/** リプライ先の表示に要る列（小プレビューの列＋原本を縦横比どおりに出すための寸法・LQIP・ALT）。 */
export const threadParentSelect = {
  ...navImageSelect,
  width: true,
  height: true,
  blurDataUrl: true,
  altText: true,
} as const;

export type ThreadParentImage = NavImage & {
  width: number;
  height: number;
  blurDataUrl: string | null;
  altText: string | null;
};

/**
 * 本画像の高さ上限（page.tsx の IMAGE_MAX_VH=72）の半分。リプライ先は本画像の「半分くらい」の
 * 大きさで控えめに出すため、幅だけでなく高さも半分に抑える（縦長写真で画面を占有しないように）。
 */
const PARENT_MAX_VH = 36;

/**
 * 画像の直上に置くリプライ先（画面上の呼び名は「スレッド」）。挿入コメントは出さず、
 * 「スレッド（@xxx）」と写真だけを出す。前の写真の投稿者が本画像と同じ（セルフスレッド・「連」）なら
 * 投稿者は本画像の下に出ているので ID は省く。写真の下から本画像へ縦線を引き、
 * この写真の続きが本画像であることを示す（ラベルだけだと何の前か伝わりにくかった）。
 * 写真は原本（サムネではない）なので RetryImage を使う（iOS の一過性のデコード失敗対策・CLAUDE.md）。
 * ALT があれば本画像と同じ「ALT」バッジ（AltTextReveal）を重ねる。バッジはボタンなので、
 * リンク（<a>）の中に入れず外側に重ねる（入れ子にすると不正な HTML になり、押すと遷移まで起きる）。
 * そのためラベルと写真は別々のリンクにしている。
 * 見えない親（削除・取り下げ・閲覧者のミュート相手）は呼び出し側のクエリで落としてあり、
 * ここでは「無いもの」として何も出さない＝痕跡を出さない。
 */
export function ThreadParent({
  parent,
  publicUrl,
  sameAuthor,
}: {
  parent: ThreadParentImage | null;
  publicUrl: string;
  /** 前の写真の投稿者が本画像の投稿者と同じか（同じなら ID を出さない） */
  sameAuthor: boolean;
}) {
  if (!parent) return null;
  const aspectRatio = parent.width / parent.height;
  return (
    <section aria-label="スレッド">
      <Link
        href={navImageHref(parent)}
        className="group mb-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {/* 本画像（下）から前の写真（上）へ戻る向き: 下から上へ伸びて右上で曲がり左を指す */}
        <CornerUpLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {/* 長い ID（username@長いドメイン）でも横にはみ出さないよう1行で省略する */}
        <span className="truncate underline-offset-[3px] group-hover:underline">
          {sameAuthor ? "スレッド" : `スレッド（@${navImageUserSegment(parent)}）`}
        </span>
      </Link>
      {/* 幅は本画像の半分。縦長は高さ上限から幅を逆算して絞る（本画像と同じ考え方） */}
      <div
        className="w-1/2"
        style={{ maxWidth: `calc(${PARENT_MAX_VH}vh * ${aspectRatio})` }}
      >
        <AltTextReveal altText={parent.altText}>
          <Link
            href={navImageHref(parent)}
            className="block overflow-hidden rounded-md transition-opacity hover:opacity-90"
          >
            <RetryImage
              src={`${publicUrl}/${parent.storageKey}`}
              alt={parent.altText || parent.overlayText}
              aspectRatio={aspectRatio}
              blurDataUrl={parent.blurDataUrl}
              containerClassName="w-full"
              imgClassName="absolute inset-0 h-full w-full object-cover"
            />
          </Link>
        </AltTextReveal>
        {/* スレッドの線: 前の写真の下端中央から本画像の上端まで伸ばし、続きであることを示す */}
        <div aria-hidden className="mx-auto h-5 w-0.5 rounded-full bg-muted-foreground/30" />
      </div>
    </section>
  );
}
