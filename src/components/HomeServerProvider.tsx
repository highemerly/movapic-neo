"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * ホームインスタンス（env HOME_SERVER）をクライアントコンポーネントへ届ける Context。
 * HOME_SERVER はランタイム env（NEXT_PUBLIC のビルド時焼き込みは使わない運用）のため、
 * root layout（サーバー）が getHomeServer() で読んだ値をここ経由で配る。
 * userPathSegment のホーム短縮判定（@/lib/userHandle）に渡して使う。
 */
const HomeServerContext = createContext<string | undefined>(undefined);

export function HomeServerProvider({
  value,
  children,
}: {
  value: string | undefined;
  children: ReactNode;
}) {
  return <HomeServerContext.Provider value={value}>{children}</HomeServerContext.Provider>;
}

/** HOME_SERVER のドメイン（未設定なら undefined = 短縮URL機能なし）。 */
export function useHomeServer(): string | undefined {
  return useContext(HomeServerContext);
}
