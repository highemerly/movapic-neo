import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";

export default function ImageNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader user={null} />
      <main className="container mx-auto max-w-2xl px-4 py-8">
        {/* ヘッダー */}
        <div className="mb-6">
          <Link href="/public">
            <Button variant="ghost" size="sm">
              ← 公開タイムラインに戻る
            </Button>
          </Link>
        </div>

        {/* ダミー画像（404風） */}
        <div className="mb-6">
          <div className="rounded-lg overflow-hidden bg-muted">
            <svg
              viewBox="0 0 800 600"
              className="w-full"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* 背景 */}
              <rect width="800" height="600" fill="#1a1a2e" />

              {/* グリッドパターン */}
              <defs>
                <pattern
                  id="grid"
                  width="40"
                  height="40"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 40 0 L 0 0 0 40"
                    fill="none"
                    stroke="#2a2a4e"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect width="800" height="600" fill="url(#grid)" />

              {/* 404テキスト */}
              <text
                x="400"
                y="280"
                textAnchor="middle"
                fontFamily="system-ui, sans-serif"
                fontSize="180"
                fontWeight="bold"
                fill="#4a4a6e"
              >
                404
              </text>

              {/* サブテキスト */}
              <text
                x="400"
                y="380"
                textAnchor="middle"
                fontFamily="system-ui, sans-serif"
                fontSize="32"
                fill="#6a6a8e"
              >
                この画像は存在しません
              </text>

              {/* 装飾的な破れた写真アイコン */}
              <g transform="translate(340, 420)">
                <rect
                  x="0"
                  y="0"
                  width="120"
                  height="90"
                  fill="#2a2a4e"
                  rx="4"
                />
                <circle cx="35" cy="30" r="12" fill="#4a4a6e" />
                <path
                  d="M 10 70 L 40 45 L 70 65 L 90 50 L 110 70 L 110 80 L 10 80 Z"
                  fill="#4a4a6e"
                />
                {/* 破れた効果 */}
                <path
                  d="M 60 0 L 65 25 L 55 30 L 70 60 L 50 90"
                  stroke="#1a1a2e"
                  strokeWidth="8"
                  fill="none"
                />
              </g>
            </svg>
          </div>
        </div>

        {/* 投稿者情報（ダミー） */}
        <div className="flex items-center gap-3 mb-6 p-4 bg-muted rounded-lg">
          <div className="w-12 h-12 rounded-full bg-muted-foreground/20 flex items-center justify-center">
            <span className="text-muted-foreground text-xl">?</span>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">不明なユーザー</p>
            <p className="text-sm text-muted-foreground">@???@???</p>
          </div>
        </div>

        {/* テキスト */}
        <div className="mb-6">
          <p className="text-lg text-muted-foreground">
            この画像は削除されたか、存在しないページです。
          </p>
        </div>

        {/* メタ情報 */}
        <div className="text-sm text-muted-foreground">
          <p>---</p>
        </div>

        {/* アクションボタン */}
        <div className="mt-8 flex gap-4">
          <Link href="/public">
            <Button variant="default">みんなの投稿を見る</Button>
          </Link>
          <Link href="/create">
            <Button variant="outline">画像を作成する</Button>
          </Link>
        </div>

        <Footer />
      </main>
    </div>
  );
}
