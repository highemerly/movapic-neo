"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, ImagePlus, Images, Globe, LayoutDashboard, Heart, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AnnouncementBar } from "./AnnouncementBar";

type SiteHeaderProps = {
  user?: {
    username: string;
  } | null;
};

function LogoutMenuItem() {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
      window.location.href = "/";
    } catch (error) {
      console.error("Logout error:", error);
      setIsLoading(false);
    }
  };

  return (
    <DropdownMenuItem
      onClick={handleLogout}
      disabled={isLoading}
      className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
    >
      <LogOut className="h-4 w-4" />
      {isLoading ? "処理中..." : "ログアウト"}
    </DropdownMenuItem>
  );
}

export function SiteHeader({ user }: SiteHeaderProps = {}) {
  return (
    <>
      <header className="border-b bg-background">
      <div className="container mx-auto px-4 py-1 max-w-6xl">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">景</span>
            </div>
            <span className="font-medium text-sm">写真に文字を合成するやつ（仮）</span>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">メニューを開く</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {user && (
                <DropdownMenuItem asChild>
                  <Link href="/dashboard" className="flex items-center gap-2 cursor-pointer font-semibold">
                    <LayoutDashboard className="h-4 w-4" />
                    ダッシュボード
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href="/create" className="flex items-center gap-2 cursor-pointer">
                  <ImagePlus className="h-4 w-4" />
                  写真を投稿
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/public" className="flex items-center gap-2 cursor-pointer">
                  <Globe className="h-4 w-4" />
                  みんなの投稿
                </Link>
              </DropdownMenuItem>
              {user && (
                <DropdownMenuItem asChild>
                  <Link href={`/u/${user.username}`} className="flex items-center gap-2 cursor-pointer">
                    <Images className="h-4 w-4" />
                    わたしの投稿
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
              {user && (
                <LogoutMenuItem />
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
      <AnnouncementBar />
    </>
  );
}
