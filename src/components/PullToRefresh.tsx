"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { RefreshCw } from "lucide-react";

type RefreshHandler = () => Promise<void>;

// 現在ページが「in-place 更新ハンドラ」を登録するための context。
// 登録があればリロードせずそれを呼ぶ。無ければ location.reload にフォールバック。
const RegisterContext = createContext<(fn: RefreshHandler | null) => void>(
  () => {}
);

/**
 * 現在ページの pull-to-refresh を「リロードではなく in-place 更新」にする。
 * タイムライン等の一覧クライアントが useInfiniteImages().refresh を渡して呼ぶ。
 * マウント中だけ有効（アンマウントで解除＝そのページはリロードに戻る）。
 */
export function useRegisterPullToRefresh(handler: RefreshHandler): void {
  const register = useContext(RegisterContext);
  useEffect(() => {
    register(handler);
    return () => register(null);
  }, [register, handler]);
}

const subscribeNoop = () => () => {};
const detectStandalone = () => {
  if (typeof window === "undefined") return false;
  // iOS Safari は navigator.standalone、Android 等は display-mode: standalone。
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    iosStandalone || window.matchMedia("(display-mode: standalone)").matches
  );
};

/**
 * インストール済み PWA（standalone）向けの自前 pull-to-refresh。アプリ全体に1つだけ置く。
 *
 * 全ページで有効で、上端から引っ張ると:
 *  - 一覧ページ（useRegisterPullToRefresh 済み）: in-place 更新（reconcile・リロード無し・
 *    削除反映＋新着にゅるっと・スクロール保持）
 *  - それ以外のページ: location.reload()（iOS PWA には他に更新手段が無いため）
 *
 * standalone 限定なのは、ブラウザのタブでは native PTR（＝リロード）が既にあるから。
 * iOS standalone は native PTR が無い／Android standalone は native があるので
 * overscroll-behavior:contain で抑止し、二重発火を防ぐ。
 */
export function PullToRefreshProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<RefreshHandler | null>(null);
  const register = useCallback((fn: RefreshHandler | null) => {
    handlerRef.current = fn;
  }, []);
  return (
    <RegisterContext.Provider value={register}>
      {children}
      <PullToRefresh handlerRef={handlerRef} />
    </RegisterContext.Provider>
  );
}

const THRESHOLD = 90; // これ以上引いたら更新（px。大きいほど要・強く引く）
const MAX_PULL = 130; // インジケータが進む最大距離（px）
const PULL_FACTOR = 0.5; // 指の移動量→追従量の比（小さいほど重い）
const BASE_OFFSET = 48; // 待機位置（画面外）への引き上げ量（px）

function PullToRefresh({
  handlerRef,
}: {
  handlerRef: MutableRefObject<RefreshHandler | null>;
}) {
  const enabled = useSyncExternalStore(
    subscribeNoop,
    detectStandalone,
    () => false
  );
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // タッチハンドラ内から最新値を読むための ref（リスナーの貼り直しを避ける）。
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  const set = (v: number) => {
    pullRef.current = v;
    setPull(v);
  };

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      // ページ最上部・更新中でない・単一指のときだけ開始候補にする。
      if (
        window.scrollY > 0 ||
        refreshingRef.current ||
        e.touches.length !== 1
      ) {
        startYRef.current = null;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      activeRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startYRef.current;
      // 上方向 or すでにスクロールしている場合は通常スクロールに戻す。
      if (dy <= 0 || window.scrollY > 0) {
        if (activeRef.current) {
          activeRef.current = false;
          set(0);
        }
        return;
      }
      // 上端で下方向 → 自前インジケータを引く。ネイティブ overscroll/PTR は抑止。
      activeRef.current = true;
      if (e.cancelable) e.preventDefault();
      set(Math.min(MAX_PULL, dy * PULL_FACTOR)); // 引くほど鈍く（抵抗感）
    };

    const onTouchEnd = async () => {
      if (startYRef.current === null) return;
      startYRef.current = null;
      if (
        !activeRef.current ||
        pullRef.current < THRESHOLD ||
        refreshingRef.current
      ) {
        activeRef.current = false;
        set(0);
        return;
      }
      activeRef.current = false;
      refreshingRef.current = true;
      setRefreshing(true);
      set(THRESHOLD); // 更新中はしきい値位置でスピナー保持

      const handler = handlerRef.current;
      if (handler) {
        // 一覧ページ: in-place 更新（リロードしない）。
        try {
          await handler();
        } catch {
          // 更新側でログ済み。ここは指標を戻すだけ。
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          set(0);
        }
      } else {
        // それ以外: スピナーを一瞬見せてからリロード。
        window.setTimeout(() => window.location.reload(), 350);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    // preventDefault するため touchmove だけ passive:false。
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    // Android のネイティブ PTR を抑止（iOS PWA は元々無いので無害）。
    // Chrome は body、Safari は html にしか効かないので両方へ入れる。
    const root = document.documentElement;
    const prevRoot = root.style.overscrollBehaviorY;
    const prevBody = document.body.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";
    document.body.style.overscrollBehaviorY = "contain";

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      root.style.overscrollBehaviorY = prevRoot;
      document.body.style.overscrollBehaviorY = prevBody;
    };
  }, [enabled, handlerRef]);

  if (!enabled) return null;

  const progress = Math.min(1, pull / THRESHOLD);
  const offset = (refreshing ? THRESHOLD : pull) - BASE_OFFSET;
  // 指で引いている最中はアニメなし（追従）、離したら戻りをアニメーション。
  const dragging = pull > 0 && !refreshing;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{
        transform: `translateY(${offset}px)`,
        transition: dragging ? "none" : "transform 0.25s ease",
      }}
    >
      <div className="mt-[env(safe-area-inset-top)] flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-md">
        <RefreshCw
          className={`h-5 w-5 text-primary ${refreshing ? "animate-spin" : ""}`}
          style={
            refreshing
              ? undefined
              : {
                  transform: `rotate(${progress * 270}deg)`,
                  opacity: 0.35 + progress * 0.65,
                }
          }
        />
      </div>
    </div>
  );
}
