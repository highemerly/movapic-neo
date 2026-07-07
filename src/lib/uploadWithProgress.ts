/**
 * アップロード進捗つき POST（XHR ラッパー）。
 *
 * fetch はアップロードのバイト進捗を取得できず（`ReadableStream` + `duplex:'half'` は
 * iOS Safari / Firefox 未対応）、送信完了イベントも取れない。そのため「アップロード中は
 * 進捗が進む限りタイムアウトしない」「アップロード完了後の処理だけをタイムアウトする」を
 * 実現できるのは XHR だけ。axios / tus 等の進捗機能も内部は XHR。
 *
 * XHR はこのファイルだけに閉じ込め、呼び出し側は fetch と同じ `Response` を受け取る。
 *
 * タイムアウト設計:
 * - アップロード中: 全体タイマーは持たず、`stallMs`（無進捗）でのみ中断＝遅いだけの回線は殺さない。
 * - アップロード完了後（= `upload` の load）: `processTimeoutMs` があればそこから計測開始。
 */

export type UploadErrorPhase =
  | "upload-stall" // アップロードが stallMs の間 1 バイトも進まなかった
  | "process-timeout" // アップロード完了後、サーバー処理が processTimeoutMs を超えた
  | "network" // 接続エラー
  | "aborted"; // 外部 signal によるキャンセル

export class UploadError extends Error {
  phase: UploadErrorPhase;
  constructor(phase: UploadErrorPhase, message: string) {
    super(message);
    this.name = "UploadError";
    this.phase = phase;
  }
}

export interface UploadWithProgressOptions {
  /** 送信中の進捗（loaded/total バイト）。lengthComputable な間だけ呼ばれる。 */
  onProgress?: (loaded: number, total: number) => void;
  /** 送信完了（＝アップロード完了、サーバー処理フェーズ開始）時に 1 回呼ばれる。 */
  onUploadComplete?: () => void;
  /** アップロード中、この時間(ms)進捗が止まったら中断（既定 20 秒）。 */
  stallMs?: number;
  /** アップロード完了後、処理がこの時間(ms)を超えたら中断。0 で無制限（既定 0）。 */
  processTimeoutMs?: number;
  /** 外部からのキャンセル（キャンセルボタン等）。 */
  signal?: AbortSignal;
}

function parseHeaders(raw: string): Headers {
  const headers = new Headers();
  for (const line of raw.trim().split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
    }
  }
  return headers;
}

/**
 * FormData を POST し、fetch 互換の `Response` を返す。
 * 生成（バイナリ）・投稿（JSON）どちらも blob で受けて `Response` 化するので、
 * 呼び出し側は `res.ok` / `res.blob()` / `res.json()` / `res.headers.get(...)` を通常どおり使える。
 */
export function uploadWithProgress(
  url: string,
  formData: FormData,
  options: UploadWithProgressOptions = {},
): Promise<Response> {
  const {
    onProgress,
    onUploadComplete,
    stallMs = 20000,
    processTimeoutMs = 0,
    signal,
  } = options;

  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let processTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = () => {
      if (stallTimer) clearTimeout(stallTimer);
      if (processTimer) clearTimeout(processTimer);
      if (signal) signal.removeEventListener("abort", onAbort);
    };

    const fail = (phase: UploadErrorPhase, message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        xhr.abort();
      } catch {
        // abort 失敗は無視（既に完了済み等）
      }
      reject(new UploadError(phase, message));
    };

    const onAbort = () => fail("aborted", "キャンセルされました");

    // アップロード中のみ stall タイマーを回す。進捗イベントごとにリセット。
    const armStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(
        () => fail("upload-stall", "アップロードが停止しました"),
        stallMs,
      );
    };

    if (signal) {
      if (signal.aborted) {
        reject(new UploadError("aborted", "キャンセルされました"));
        return;
      }
      signal.addEventListener("abort", onAbort);
    }

    xhr.upload.addEventListener("progress", (e) => {
      armStall();
      if (onProgress && e.lengthComputable) onProgress(e.loaded, e.total);
    });

    // 送信完了 = アップロード完了。stall を止め、処理タイムアウトを開始。
    xhr.upload.addEventListener("load", () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = undefined;
      onUploadComplete?.();
      if (processTimeoutMs > 0) {
        processTimer = setTimeout(
          () => fail("process-timeout", "サーバー処理がタイムアウトしました"),
          processTimeoutMs,
        );
      }
    });

    xhr.addEventListener("load", () => {
      if (settled) return;
      settled = true;
      cleanup();
      const headers = parseHeaders(xhr.getAllResponseHeaders());
      resolve(
        new Response(xhr.response as Blob, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers,
        }),
      );
    });

    xhr.addEventListener("error", () =>
      fail("network", "通信エラーが発生しました"),
    );
    xhr.addEventListener("timeout", () =>
      fail("network", "通信がタイムアウトしました"),
    );

    xhr.open("POST", url);
    xhr.responseType = "blob";
    armStall(); // 送信開始前の初期 stall（接続確立できない場合の保険）
    xhr.send(formData);
  });
}
