/**
 * 投稿完了直後に出す「ホーム画面に追加しませんか？」モーダルの表示可否と頻度制御。
 *
 * 判定材料はすべて引数で受け取る純関数にし、localStorage の読み書きだけを薄く包む
 * （端末ごとの話なのでサーバー/DBには持たせない）。
 */

import type { PwaPlatform } from "./install";
import { LOCAL_KEYS } from "@/lib/storageKeys";

/** 断られた回数に対する次回表示までの猶予（日）。配列を使い切ったら打ち止め。 */
const COOLDOWN_DAYS = [30, 90];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SuggestState {
  /** 断られた回数（モーダルを閉じた／OSのインストールダイアログをキャンセルした） */
  dismissCount: number;
  /** この時刻（epoch ms）までは出さない */
  nextAt: number;
  /** 打ち止め。以後どんな条件でも出さない */
  done: boolean;
}

export const INITIAL_SUGGEST_STATE: SuggestState = {
  dismissCount: 0,
  nextAt: 0,
  done: false,
};

export interface SuggestInput {
  /** 対象プラットフォーム（デスクトップ・iOS非Safariは "other" ＝対象外） */
  platform: PwaPlatform;
  /** すでにホーム画面アプリとして起動しているか */
  standalone: boolean;
  /** beforeinstallprompt を捕捉済みか（Android のみ意味を持つ） */
  canInstall: boolean;
  /** サーバー側の前提（投稿者本人＋2投稿目以降）を満たすか */
  eligiblePost: boolean;
  state: SuggestState;
  now: number;
}

/**
 * インストール提案モーダルを出してよいか。
 * Android は beforeinstallprompt が来ていないとインストールできない（＝導入済み or 非対応）ので出さない。
 * iOS Safari はプログラムから判定・起動ができないため、手順案内として常に対象にする
 * （ブラウザのタブからは導入済みか判別できないので、頻度制御の打ち止めで許容する）。
 */
export function shouldSuggestInstall(input: SuggestInput): boolean {
  const { platform, standalone, canInstall, eligiblePost, state, now } = input;
  if (!eligiblePost) return false;
  if (standalone) return false;
  if (state.done) return false;
  if (now < state.nextAt) return false;
  if (platform === "ios-safari") return true;
  if (platform === "android") return canInstall;
  return false;
}

/** 断られたときの次状態（猶予を伸ばし、使い切ったら打ち止め）。 */
export function afterDismiss(state: SuggestState, now: number): SuggestState {
  const dismissCount = state.dismissCount + 1;
  const days = COOLDOWN_DAYS[dismissCount - 1];
  if (days === undefined) {
    return { dismissCount, nextAt: state.nextAt, done: true };
  }
  return { dismissCount, nextAt: now + days * DAY_MS, done: false };
}

/** 保存値を SuggestState として解釈する（壊れていれば初期値）。 */
export function parseSuggestState(raw: string | null): SuggestState {
  if (!raw) return INITIAL_SUGGEST_STATE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return INITIAL_SUGGEST_STATE;
    const o = parsed as Record<string, unknown>;
    return {
      dismissCount: typeof o.dismissCount === "number" ? o.dismissCount : 0,
      nextAt: typeof o.nextAt === "number" ? o.nextAt : 0,
      done: o.done === true,
    };
  } catch {
    return INITIAL_SUGGEST_STATE;
  }
}

export function loadSuggestState(): SuggestState {
  if (typeof window === "undefined") return INITIAL_SUGGEST_STATE;
  try {
    return parseSuggestState(localStorage.getItem(LOCAL_KEYS.pwaSuggest));
  } catch {
    // プライベートブラウズ等で localStorage が使えない場合は毎回初期値（＝提案は出る）
    return INITIAL_SUGGEST_STATE;
  }
}

export function saveSuggestState(state: SuggestState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_KEYS.pwaSuggest, JSON.stringify(state));
  } catch {
    // 保存できなくても導線自体は動かす
  }
}
