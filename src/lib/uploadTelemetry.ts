/**
 * アップロード失敗の軽量計測（クライアント → /api/v1/telemetry/upload-error）。
 *
 * 背景: 「通信エラーが発生しました」(= uploadWithProgress の network フェーズ)が一部ユーザーで
 * 頻発するが開発環境では再現しない。原因の層（Vultr LB のアイドル切断 / worker-front pod の
 * 再起動 / モバイル回線の瞬断）を切り分けるための一時的な計測。
 *
 * 肝は `uploadCompleted`:
 *  - true  … 送信完了後の“沈黙区間”（サーバー処理待ち）で切断 → LB/pod 側の疑い
 *  - false … 送信中に切断 → 上り回線 / モバイル側の疑い
 * これに `elapsedMs`（固定値付近なら経路上の固定タイムアウトを示唆）・回線種別・画像サイズを
 * 添えることで、再現しなくてもデータで原因層を特定できる。
 *
 * fire-and-forget（sendBeacon）。応答は待たず、失敗しても本処理には影響させない。
 */

import type { UploadErrorPhase } from "@/lib/uploadWithProgress";

export interface UploadFailureReport {
  /** どのエンドポイントで失敗したか。 */
  endpoint: "generate" | "post";
  /** 失敗フェーズ（network / upload-stall / process-timeout / aborted）。 */
  phase: UploadErrorPhase;
  /** onUploadComplete が発火したか。送信中の切断か沈黙区間の切断かの決定的な切り分け。 */
  uploadCompleted: boolean;
  /** 最後に観測したアップロード進捗(%)。 */
  uploadPct: number;
  /** 元画像のバイト数。大きい画像との相関を見る。 */
  fileSize: number;
  /** 出力形式。 */
  output: string;
  /** 開始から失敗までの経過ms。固定値付近なら経路上の固定タイムアウトを示唆。 */
  elapsedMs: number;
  /** それまでに行った自動リトライ回数。 */
  retryCount: number;
  /** 選択画像のMIME種別（Android の Google フォト/Motion Photo 等の切り分け用）。 */
  fileType?: string;
  /** 選択画像の拡張子（ファイル名は送らずプライバシー配慮で拡張子のみ）。 */
  fileExt?: string;
  /**
   * 失敗時点で画像ファイルの中身を実際に読めたか。
   * Android では Google フォト等のクラウドのみ画像/content:// 権限失効で「送信時にファイル本体を
   * 読めず即失敗（pct=0）」が起きる。readable=false なら network フェーズの正体がこれだと確定できる。
   */
  fileReadable?: boolean;
  /** 上記読み取りにかかった時間ms。 */
  fileReadMs?: number;
  /** 読み取り失敗時の例外名（NotReadableError 等）。 */
  fileReadError?: string;
}

/**
 * 失敗時に画像ファイルが実際に読めるかを実測する。
 * network フェーズ（送信前に即失敗）の正体が「ファイル本体を読めない（Android のクラウド画像等）」か
 * どうかを確定させるための計測。エラーパスでのみ呼ぶので全読み込みのコストは許容する。
 */
export async function probeFileReadable(
  file: File | null,
): Promise<Pick<UploadFailureReport, "fileType" | "fileExt" | "fileReadable" | "fileReadMs" | "fileReadError">> {
  if (!file) return {};
  const dot = file.name.lastIndexOf(".");
  const fileExt = dot >= 0 ? file.name.slice(dot + 1).toLowerCase().slice(0, 8) : "";
  const started = Date.now();
  try {
    // slice(...).arrayBuffer() で本体の読み取りを強制（クラウドのみ画像はここで NotReadableError）。
    await file.slice(0, file.size).arrayBuffer();
    return { fileType: file.type, fileExt, fileReadable: true, fileReadMs: Date.now() - started };
  } catch (e) {
    return {
      fileType: file.type,
      fileExt,
      fileReadable: false,
      fileReadMs: Date.now() - started,
      fileReadError: e instanceof Error ? e.name : "unknown",
    };
  }
}

// navigator.connection（Network Information API）は実験的で型定義が無いため最小限で受ける。
interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  type?: string;
}

function connectionInfo(): NetworkInformationLike {
  const nav = navigator as Navigator & { connection?: NetworkInformationLike };
  const c = nav.connection;
  if (!c) return {};
  return {
    effectiveType: c.effectiveType,
    downlink: c.downlink,
    rtt: c.rtt,
    saveData: c.saveData,
    type: c.type,
  };
}

export function reportUploadFailure(info: UploadFailureReport): void {
  try {
    const payload = { ...info, connection: connectionInfo() };
    const blob = new Blob([JSON.stringify(payload)], {
      type: "application/json",
    });
    navigator.sendBeacon?.("/api/v1/telemetry/upload-error", blob);
  } catch {
    // 計測なので失敗は無視（本処理には一切影響させない）。
  }
}
