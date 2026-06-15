// 許可サーバー（ALLOWED_SERVERS）をパースする。
// 未設定・空文字なら制限なし（=自由入力）として undefined を返す。
export function getAllowedServers(): string[] | undefined {
  const allowed = process.env.ALLOWED_SERVERS;
  if (!allowed || allowed.trim() === "") {
    return undefined;
  }
  return allowed.split(",").map((s) => s.trim().toLowerCase());
}
