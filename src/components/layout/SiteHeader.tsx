"use client";

import Link from "next/link";
import { Menu, ImagePlus, Images, Globe, Settings, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SiteHeaderProps = {
  user?: {
    username: string;
  } | null;
};

export function SiteHeader({ user }: SiteHeaderProps = {}) {
  return (
    <header className="border-b bg-background">
      <div className="container mx-auto px-4 py-3 max-w-6xl">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">文</span>
            </div>
            <span className="font-semibold text-lg">写真に文字を合成するやつ（仮）</span>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">メニューを開く</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/create" className="flex items-center gap-2 cursor-pointer font-semibold">
                  <ImagePlus className="h-4 w-4" />
                  画像を投稿
                </Link>
              </DropdownMenuItem>
              {user && (
                <DropdownMenuItem asChild>
                  <Link href={`/u/${user.username}`} className="flex items-center gap-2 cursor-pointer">
                    <Images className="h-4 w-4" />
                    自分の投稿を確認
                  </Link>
                </DropdownMenuItem>
              )}
              {user && (
                <DropdownMenuItem asChild>
                  <Link href="/favorite" className="flex items-center gap-2 cursor-pointer">
                    <Heart className="h-4 w-4" />
                    お気に入り
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href="/public" className="flex items-center gap-2 cursor-pointer">
                  <Globe className="h-4 w-4" />
                  公開タイムライン
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings" className="flex items-center gap-2 cursor-pointer">
                  <Settings className="h-4 w-4" />
                  設定を確認
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
