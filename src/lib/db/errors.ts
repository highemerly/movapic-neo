/**
 * Prisma エラーの判定ヘルパ。
 *
 * `instanceof Prisma.PrismaClientKnownRequestError` ではなく code を見る: テストで
 * vi.mock した prisma が投げる `{ code: "P2002" }` 形のエラーも同じ経路で判定するため。
 */

/** 一意制約違反（P2002）か。レース時の二重付与を DB の @@unique で弾いたケースの検出に使う。 */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}
