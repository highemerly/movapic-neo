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
        href="/terms"
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        利用規約
      </Link>
      <Link
        href="/privacy"
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        プライバシーポリシー
      </Link>
      <Link
        href="/spec"
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        技術仕様
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
