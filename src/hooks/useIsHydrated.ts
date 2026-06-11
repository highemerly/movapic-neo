import { useSyncExternalStore } from "react";

// 値は永続的に変化しない（hydration 後は常に true）ため subscribe は no-op。
const emptySubscribe = () => () => {};

/**
 * クライアントで hydration が完了したかを返す。
 *
 * SSR と初回クライアント描画では false、hydration 後は true。
 * useSyncExternalStore の server/client snapshot 差を使うため、
 * 「effect 内 setState」（react-hooks/set-state-in-effect）を発生させずに
 * クライアント専用値（localStorage/navigator/cookie 等）を安全に読める。
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true, // client snapshot
    () => false // server snapshot
  );
}
