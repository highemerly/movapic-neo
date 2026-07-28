/**
 * 未ログイン（ゲスト）の下書きを、ログイン往復（Fediverse サーバーへの全面遷移と復帰）の
 * あいだ保持するためのストア。写真＋設定を1レコードにまとめて IndexedDB に保存する。
 *
 * なぜ IndexedDB か（Cache Storage ではない理由）:
 *   Cache Storage（window.caches）は secure context でしか露出しない。dev を Network アドレス
 *   （http://192.168.x.x:3000 等）で開くと `caches` が undefined になり、画像の退避が無言で
 *   スキップされる（実際にこの問題が発生した）。IndexedDB は非 secure な http でも使え、Blob を
 *   そのまま保存できるので環境依存の穴が無い。
 *
 * 画像は最大20MB になり得るため sessionStorage には載らない。設定も同じレコードに入れて、
 * 復元は1回の読み出し・破棄は1回の削除で完結させる（取りこぼしと片側だけ残るのを防ぐ）。
 */

import type { Position, FontFamily, Color, Size, Arrangement } from "@/types";

// DB名にバージョン接尾辞を付けておき、将来スキーマを変えたいときは名前ごと捨てられるようにする。
const DB_NAME = "shamezo:guest-draft-v1";
const STORE = "draft";
const KEY = "current";

export interface GuestDraftSettings {
  text: string;
  position: Position;
  font: FontFamily;
  color: Color;
  size: Size;
  arrangement: Arrangement;
  season: string | null;
  altText: string;
}

export interface GuestDraftRecord {
  imageBlob: Blob;
  imageName: string;
  imageType: string;
  settings: GuestDraftSettings;
  /** 退避した時刻（epoch ms）。TTL 判定にだけ使う。 */
  savedAt: number;
}

/**
 * 下書きの保持期限。
 *
 * ログイン往復は OAuth state・各 cookie・MiAuth の ts がいずれも 10分で切れるため、退避から
 * 10分以上経った下書きが `/create?restore=1` に到達することはあり得ない。ただし退避が走るのは
 * 「ログインして投稿」を押した瞬間で、その後モーダルでサーバーを選ぶ滞在時間はユーザー任せ
 * なので、10分ちょうどにすると「モーダルで少し迷った人がログイン成功直後に写真を失う」という
 * 最悪の壊れ方をする。滞在ぶんの余裕を足して 30分にしてある。
 *
 * 短くしたい場合は、退避時ではなく register 送信が成功した時点で savedAt を打ち直す
 * （＝OAuth state の発行と時刻を揃える）必要がある。
 */
export const GUEST_DRAFT_TTL_MS = 30 * 60 * 1000;

/**
 * 下書きが期限切れか。savedAt が無いレコード（TTL 導入前に書かれたもの）は期限切れ扱いにする
 * ＝いつ退避されたか分からない写真を残さない。
 */
export function isGuestDraftExpired(
  savedAt: unknown,
  now: number = Date.now()
): boolean {
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return true;
  return now - savedAt > GUEST_DRAFT_TTL_MS;
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) {
        open.result.createObjectStore(STORE);
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(req.result as T);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

/** 下書き（写真＋設定）を保存する。既存があれば上書き。savedAt はここで打つ（打ち忘れ防止）。 */
export async function saveGuestDraft(
  record: Omit<GuestDraftRecord, "savedAt">,
): Promise<void> {
  await withStore("readwrite", (store) =>
    store.put({ ...record, savedAt: Date.now() }, KEY),
  );
}

/** 保存済みの下書きを取り出す（無ければ null）。期限切れなら読まずに捨てて null を返す。 */
export async function loadGuestDraft(): Promise<GuestDraftRecord | null> {
  const rec = await withStore<GuestDraftRecord | undefined>("readonly", (store) =>
    store.get(KEY),
  );
  if (!rec) return null;
  if (isGuestDraftExpired(rec.savedAt)) {
    await clearGuestDraft();
    return null;
  }
  return rec;
}

/**
 * 期限切れの下書きを削除する（有効なものは触らない）。
 *
 * loadGuestDraft の期限判定だけでは「読まない」だけで Blob はディスクに残るため、能動的に消す
 * 経路が要る。退避したままログインをやめたケースで、共用端末に他人の写真（最大20MB）が残り
 * 続けるのを防ぐのが目的。呼び出しは best-effort（失敗しても投稿導線を止めない）。
 */
export async function purgeExpiredGuestDraft(): Promise<void> {
  const rec = await withStore<GuestDraftRecord | undefined>("readonly", (store) =>
    store.get(KEY),
  );
  if (rec && isGuestDraftExpired(rec.savedAt)) {
    await clearGuestDraft();
  }
}

/** 下書きを破棄する（復元後に呼ぶ）。 */
export async function clearGuestDraft(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(KEY));
}
