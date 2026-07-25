# リアクション（src/lib/reactions）

SHAMEZO のリアクションは「オーナーインスタンスのキャッシュ」＋「`Reaction` テーブル」の
2系統をマージして表示する。TTL・定期同期・取り消し反映を含む全体仕様は
[docs/favorite.md](../../../docs/favorite.md)。ここは純粋ロジック層の索引と不変条件。

## ファイル
| ファイル | 役割 |
|---|---|
| `types.ts` | 共有の型（`ReactionChip` / `ReactionUser` / `CachedFavoriter` / `ReactionTotalsCache` / `StoredReaction`） |
| `merge.ts` | **表示の唯一の組み立て**。件数・ユーザー一覧・閲覧者状態を1本で組む（`mergeReactions`） |
| `store.ts` | `Reaction` テーブルの読み書き（`loadStoredReactions` / `setReaction` / `clearReaction` / 取り消し反映の `loadReactionsForReconcile` / `deleteReactions`） |
| `reconcile.ts` | オーナー側で取り消されたリアクションを割り出す純粋ロジック（`reactionsUnfavoritedOnOwner`） |
| `emojiKey.ts` | 正規化キー（`FAVOURITE_KEY=❤`・Unicode正規化・カスタム絵文字 `:name@host:`・選択可否判定） |
| `unicodeCatalog.ts` | ピッカー用 Unicode 絵文字カタログ（emojibase 日本語・セクション/検索） |

## 不変条件
- **表示は必ず `mergeReactions` を通す**。API・詳細ページのSSR初期値・同期時の `favoriteCount` 再計算がこの1本を共有する（表示とDBの件数がズレないため）。
- 同じ人がオーナー側キャッシュと `Reaction` の両方に居たら **`Reaction` を正**とする（本人の意図した絵文字で表示するための載せ替え）。
- 種別不明（Mastodon の favourite・機能導入前の行）は `FAVOURITE_KEY(❤)` に寄せる。
- カスタム絵文字キーは `:name@host:`。押せるのは自サーバーの絵文字のみ。
- 上位40件しかキャッシュしないため、チップの件数と一覧の長さは一致しないことがある（「ほかN人」）。取り消し反映も40件フルの回は諦める（[reconcile.ts](reconcile.ts) の doc）。
- `merge.ts` / `store.ts` / `reconcile.ts` は **sharp/skia を import しない**（worker-front から呼ぶため）。
