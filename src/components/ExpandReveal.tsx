"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * マウント時に高さ 0 → auto へ「うにょー」と伸びながら現れるラッパー。
 * grid-template-rows の 0fr→1fr 補間トリックで、高さ unknown でも滑らかに展開する。
 *
 * サーバーから渡された子要素をそのまま包めるよう client 化している。
 * 再生し直したい場合は呼び出し側で key を変える（例: 選択キーごとに remount）。
 */
export function ExpandReveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // 初回ペイント（高さ0・透明）の次フレームで展開を開始してトランジションを走らせる
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
