"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
      className="flex items-center gap-3 cursor-pointer text-destructive focus:text-destructive py-3 text-base"
    >
      <LogOut className="h-5 w-5" />
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
          <Link href="/dashboard" className="flex items-center hover:opacity-80 transition-opacity">
            <Image src="/shamezo_logo.svg" alt="SHAMEZO" width={160} height={29} priority />
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">メニューを開く</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {user && (
                <DropdownMenuItem asChild className="py-3 text-base">
                  <Link href="/dashboard" className="flex items-center gap-3 cursor-pointer">
                    <LayoutDashboard className="h-5 w-5" />
                    メニュー
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild className="py-3 text-base">
                <Link href="/create" className="flex items-center gap-3 cursor-pointer font-semibold">
                  <ImagePlus className="h-5 w-5" />
                  写真を投稿
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="py-3 text-base">
                <Link href="/public" className="flex items-center gap-3 cursor-pointer">
                  <Globe className="h-5 w-5" />
                  みんなの写真
                </Link>
              </DropdownMenuItem>
              {user && (
                <DropdownMenuItem asChild className="py-3 text-base">
                  <Link href={`/u/${user.username}`} className="flex items-center gap-3 cursor-pointer">
                    <Images className="h-5 w-5" />
                    自分の写真
                  </Link>
                </DropdownMenuItem>
              )}
              {user && (
                <DropdownMenuItem asChild className="py-3 text-base">
                  <Link href="/favorite" className="flex items-center gap-3 cursor-pointer">
                    <Heart className="h-5 w-5" />
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
