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

/** 下書き（写真＋設定）を保存する。既存があれば上書き。 */
export async function saveGuestDraft(record: GuestDraftRecord): Promise<void> {
  await withStore("readwrite", (store) => store.put(record, KEY));
}

/** 保存済みの下書きを取り出す（無ければ null）。 */
export async function loadGuestDraft(): Promise<GuestDraftRecord | null> {
  const rec = await withStore<GuestDraftRecord | undefined>("readonly", (store) =>
    store.get(KEY),
  );
  return rec ?? null;
}

/** 下書きを破棄する（復元後に呼ぶ）。 */
export async function clearGuestDraft(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(KEY));
}
