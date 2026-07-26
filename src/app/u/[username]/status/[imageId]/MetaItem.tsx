import type { ComponentProps, ComponentType, ReactNode } from "react";
import DefaultLink from "@/components/Link";
import { cn } from "@/lib/utils";

/**
 * 画像詳細ページのメタ行（機種名・撮影場所・撮影日時・フォント・投稿ソース・獲得実績）の1項目。
 *
 * かつては項目ごとに書き下ろしていたため、hover 表現（下線が出る／文字が濃くなる）・アイコンとの
 * 間隔・タップ領域の確保がばらばらだった。さらに「押せるかどうか」が hover するまで分からず、
 * hover の無いタッチ環境ではモーダルを開けることに気づけなかった。
 *
 * そこで見た目と当たり判定をここへ集約する。メタ行に項目を足すときは必ずこれを通すこと。
 * - hover では 下線＋文字を濃く（遷移かモーダルかで表現は変えない）
 * - 平常時は素のテキストのまま（押せることを示す常時下線は、行がうるさくなるので出さない）
 * - 下線はラベルにだけ掛ける（inline-flex 直下に underline を置くとアイコンの下にも線が伸びる）
 */

type Tone = "muted" | "amber";

/** hover で濃くする色。tone ごとに「濃くなる」表現だけ揃え、色相は各項目の意味づけを残す。 */
const TONE_TEXT: Record<Tone, string> = {
  muted: "hover:text-foreground",
  amber: "hover:text-amber-900 dark:hover:text-amber-200",
};

// -my-1 py-1: 13px の細い行でもタップ／クリックしやすいよう、行の高さを変えずに当たり判定を縦へ広げる。
const BASE = "inline-flex items-center gap-1 -my-1 py-1";
const INTERACTIVE = "group/meta transition-colors";
const LABEL_INTERACTIVE = "underline-offset-[3px] group-hover/meta:underline";

type Base = {
  /** 行頭のアイコン。呼び出し側で `h-3.5 w-3.5 shrink-0` を付けて渡す */
  icon?: ReactNode;
  tone?: Tone;
  /** ラベル（下線が掛かる span）側に足すクラス。truncate 等の幅制御はここに渡す */
  labelClassName?: string;
  children: ReactNode;
};

type LinkComponent = ComponentType<ComponentProps<typeof DefaultLink>>;

type Props = Base &
  (
    | ({ as?: "static" } & ComponentProps<"span">)
    | ({ as: "button" } & ComponentProps<"button">)
    | ({ as: "link"; href: string; linkComponent?: LinkComponent } & Omit<
        ComponentProps<typeof DefaultLink>,
        "href"
      >)
    | ({ as: "external"; href: string } & Omit<ComponentProps<"a">, "href">)
  );

const OWN_PROP_KEYS = [
  "as",
  "icon",
  "tone",
  "labelClassName",
  "children",
  "className",
  "linkComponent",
] as const;

/**
 * MetaItem 固有の props を除いた残り＝描画先の要素（button / a / span）へそのまま流すもの。
 * FontLicenseDialog は DialogTrigger asChild で onClick や ref を注入してくるので、
 * 受け取った props を取りこぼさずに透過する必要がある。
 */
function passThrough<T extends object>(props: T) {
  const own: readonly string[] = OWN_PROP_KEYS;
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => !own.includes(key)),
  ) as Omit<T, (typeof OWN_PROP_KEYS)[number]>;
}

export function MetaItem(props: Props) {
  const tone = props.tone ?? "muted";
  const interactive = !!props.as && props.as !== "static";
  const className = cn(
    BASE,
    interactive && INTERACTIVE,
    interactive && TONE_TEXT[tone],
    props.className,
  );

  const body = (
    <>
      {props.icon}
      <span className={cn(interactive && LABEL_INTERACTIVE, props.labelClassName)}>
        {props.children}
      </span>
    </>
  );

  if (props.as === "button") {
    return (
      <button type="button" className={className} {...passThrough(props)}>
        {body}
      </button>
    );
  }

  if (props.as === "link") {
    // 都道府県は遷移後スクロールのため PrefectureScrollLink を差し込む（既定は共通の Link）。
    const LinkTag = props.linkComponent ?? DefaultLink;
    return (
      <LinkTag className={className} {...passThrough(props)}>
        {body}
      </LinkTag>
    );
  }

  if (props.as === "external") {
    return (
      <a
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        {...passThrough(props)}
      >
        {body}
      </a>
    );
  }

  return (
    <span className={className} {...passThrough(props)}>
      {body}
    </span>
  );
}
