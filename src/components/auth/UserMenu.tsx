"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface UserMenuProps {
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    emailPrefix: string;
    instance: {
      domain: string;
    };
  };
}

export function UserMenu({ user }: UserMenuProps) {
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
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        {user.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.displayName || user.username}
            className="w-8 h-8 rounded-full"
          />
        )}
        <div className="text-sm">
          <div className="font-medium">{user.displayName || user.username}</div>
          <div className="text-muted-foreground text-xs">
            @{user.username}@{user.instance.domain}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            ダッシュボード
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          disabled={isLoading}
        >
          {isLoading ? "処理中..." : "ログアウト"}
        </Button>
      </div>
    </div>
  );
}
