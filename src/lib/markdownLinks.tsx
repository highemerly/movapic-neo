import Link from "@/components/Link";

// 本文中の [テキスト](URL) 形式リンクをパースして React ノード列に変換する。
// http(s) の絶対URLは新規タブの <a>、それ以外（内部パス）は @/components/Link で描画する。
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
    const [, label, href] = match;
    const isExternal = /^https?:\/\//.test(href);
    nodes.push(
      isExternal ? (
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:no-underline"
        >
          {label}
        </a>
      ) : (
        <Link
          key={key++}
          href={href}
          className="text-primary underline hover:no-underline"
        >
          {label}
        </Link>
      )
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}
