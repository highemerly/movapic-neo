import Link from "@/components/Link";
import { FooterThemeToggle } from "@/components/FooterThemeToggle";

export function Footer() {
  return (
    <footer className="mt-8 space-y-2">
      <div>
        <FooterThemeToggle />
      </div>
      <div className="space-x-4">
        <Link
          href="/announcements"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          お知らせ
        </Link>
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
          href="/stats"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          統計
        </Link>
        <Link
          href="/spec"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          技術仕様
        </Link>
        <a
          href="https://highemerly.net/contact.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          お問い合わせ
        </a>
      </div>
    </footer>
  );
}
