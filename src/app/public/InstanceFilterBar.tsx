import Link from "@/components/Link";
import { cn } from "@/lib/utils";

interface InstanceFilterBarProps {
  /** ログイン中ユーザーの所属サーバードメイン。未ログインなら null */
  ownInstance: string | null;
  /** 現在選択中の instances パラメータ（単一ドメイン）。未指定（すべて）なら null */
  selected: string | null;
}

const pill = "rounded-full px-2.5 py-0.5 font-medium transition-colors whitespace-nowrap";
const active = "bg-primary text-primary-foreground";
const inactive = "bg-muted text-muted-foreground hover:text-foreground";

/**
 * 公開タイムラインのサーバー絞り込みチップ（「すべて」／「自分のサーバー」の2択）。
 * 未ログイン時は所属サーバーが無いため行ごと非表示。
 */
export function InstanceFilterBar({ ownInstance, selected }: InstanceFilterBarProps) {
  if (!ownInstance) return null;

  const isAll = !selected;
  const isOwn = selected === ownInstance;

  return (
    <nav className="flex items-center gap-1.5 text-xs" aria-label="サーバーフィルタ">
      <Link href="/public" className={cn(pill, isAll ? active : inactive)}>
        すべて
      </Link>
      <Link
        href={`/public?instances=${encodeURIComponent(ownInstance)}`}
        className={cn(pill, isOwn ? active : inactive)}
      >
        {ownInstance}
      </Link>
    </nav>
  );
}
