/**
 * PWAインストール導線のためのクライアント側ロジック。
 *
 * - Android/デスクトップ Chrome系: `beforeinstallprompt` を捕捉して自前ボタンから
 *   `prompt()` を呼べるようにする（イベントはページ読込直後に1回だけ飛ぶことがあるため、
 *   アプリ起動時＝レイアウトで早めに捕捉しておく必要がある）。
 * - iOS Safari: プログラムからのインストールは不可。手順案内のみ（このモジュールは判定だけ提供）。
 *
 * 既存方針に合わせ「デスクトップには出さない」。表示可否は detectPwaPlatform を見て
 * 呼び出し側（InstallAppSection）が決める。
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let initialized = false;

function emit() {
  for (const l of listeners) l();
}

/** beforeinstallprompt / appinstalled の捕捉を開始する（多重呼び出し安全）。 */
export function initInstallCapture(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    // 既定のミニ情報バーを抑止し、自前ボタンから出せるよう保持する
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit();
  });
}

/** useSyncExternalStore 用: インストール可否の購読。 */
export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** いま自前ボタンでインストールダイアログを出せるか（Android等で beforeinstallprompt 捕捉済み）。 */
export function getCanInstall(): boolean {
  return deferredPrompt !== null;
}

/** 捕捉済みの beforeinstallprompt を使ってインストールダイアログを表示する。 */
export async function triggerInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  if (!deferredPrompt) return "unavailable";
  const e = deferredPrompt;
  await e.prompt();
  const choice = await e.userChoice;
  // prompt は1回しか使えないので破棄
  deferredPrompt = null;
  emit();
  return choice.outcome;
}

export type PwaPlatform = "ios-safari" | "android" | "other";

/**
 * インストール導線を出す対象プラットフォームを判定する。
 * デスクトップや iOS の非Safari（追加不可）は "other" として出さない。
 */
export function detectPwaPlatform(): PwaPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS は Mac を名乗るため、タッチ可能な Mac は iPad とみなす
    (navigator.maxTouchPoints > 1 && /macintosh/i.test(ua));
  if (isIOS) {
    // iOS でホーム画面に追加できるのは Safari のみ
    const isSafari = !/crios|fxios|edgios|opios|mercury/i.test(ua);
    return isSafari ? "ios-safari" : "other";
  }
  if (/android/i.test(ua)) return "android";
  return "other";
}

/** すでにホーム画面アプリ（standalone）として起動しているか。
 * iOSは WebView でも `display-mode: standalone` が誤マッチするため、ホーム画面PWAでのみ
 * true になる `navigator.standalone` だけを見る（layout.tsx の判定と同方針）。 */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  const isIos =
    /iphone|ipad|ipod/i.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  return isIos
    ? nav.standalone === true
    : window.matchMedia("(display-mode: standalone)").matches;
}
