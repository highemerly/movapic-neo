import Link from "@/components/Link";

// href がリンク化して安全なURLかを判定する。
// - http(s) 絶対URL → 外部リンク（新規タブ）
// - "/" 始まりの内部パス → 内部遷移。ただし protocol-relative "//" や "/\"（ブラウザが
//   "//" と解釈しうる）は外部扱いになり open redirect になるため内部から除外。
// それ以外（javascript:/data:/mailto: 等の危険スキームや相対パス）は false を返し、
// 呼び出し側はリンク化せずラベルのみ描画する（XSS・open redirect を防ぐ）。
export function classifyHref(href: string): "external" | "internal" | "unsafe" {
  if (/^https?:\/\//i.test(href)) return "external";
  if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")) {
    return "internal";
  }
  return "unsafe";
}

// 本文中の [テキスト](URL) 形式リンクをパースして React ノード列に変換する。
// 安全なURL（http(s) 絶対URL / "/" 始まりの内部パス）のみリンク化し、危険スキームは
// ラベルをプレーンテキストで出す。
export function renderInlineLinks(text: string): React.ReactNode[] {
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const [, label, rawHref] = match;
    const href = rawHref.trim();
    const kind = classifyHref(href);
    if (kind === "external") {
      nodes.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:no-underline"
        >
          {label}
        </a>
      );
    } else if (kind === "internal") {
      nodes.push(
        <Link
          key={key++}
          href={href}
          className="text-primary underline hover:no-underline"
        >
          {label}
        </Link>
      );
    } else {
      // 危険スキーム/不正な形式はリンク化せずラベルのみ描画
      nodes.push(label);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}
