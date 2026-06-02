"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface LogoutButtonProps {
  className?: string;
  variant?: "destructive" | "ghost" | "outline";
}

export function LogoutButton({ className, variant = "destructive" }: LogoutButtonProps) {
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
    <Button
      variant={variant}
      size="sm"
      onClick={handleLogout}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? "処理中..." : "ログアウト"}
    </Button>
  );
}
