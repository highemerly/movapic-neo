import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-8 space-x-4">
      <Link
        href="/license"
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        フォントライセンス
      </Link>
      <Link
        href="/privacy"
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        プライバシーポリシー
      </Link>
      <a
        href="https://handon.club/@highemerly"
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        お問い合わせ
      </a>
    </footer>
  );
}
