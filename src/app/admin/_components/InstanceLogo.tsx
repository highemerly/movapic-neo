import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { MisskeyIcon } from "@/components/icons/MisskeyIcon";

/** サーバー種別のロゴ（Mastodon=紫 / Misskey=緑）。ホバーで種別名を出す。 */
export function InstanceLogo({ type }: { type: string }) {
  const misskey = type === "misskey";
  return (
    <span
      title={misskey ? "Misskey" : "Mastodon"}
      className="inline-flex align-middle"
    >
      {misskey ? (
        <MisskeyIcon className="h-4 w-4 text-[#86b300]" />
      ) : (
        <MastodonIcon className="h-4 w-4 text-[#6364ff]" />
      )}
    </span>
  );
}
