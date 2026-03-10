import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b bg-background">
      <div className="container mx-auto px-4 py-3 max-w-6xl">
        <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">文</span>
          </div>
          <span className="font-semibold text-lg">写真に文字を合成するやつ（仮）</span>
        </Link>
      </div>
    </header>
  );
}
