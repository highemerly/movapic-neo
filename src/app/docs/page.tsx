/**
 * ドキュメントセンター（/docs）: 公開ドキュメントへのリンク集。
 *
 * 以前は仕様の本文をこのページに直接書いていたが、入口としての一覧性を優先し、
 * 本文は /docs/spec（技術仕様）へ移してここからはリンクだけを張る。
 */

import type { Metadata } from "next";
import Link from "@/components/Link";
import {
  History,
  ChevronRight,
  Type,
  ChartColumn,
  Smile,
  Sparkles,
  Code,
  Megaphone,
  ScrollText,
  ShieldCheck,
  KeyRound,
  Mail,
  Activity,
  ExternalLink,
  GitBranch,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { PageContainer } from "@/components/PageContainer";
import { sortedReleaseNotes } from "@/data/releaseNotes";
import { version } from "../../../package.json";

function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${y}/${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export const metadata: Metadata = {
  title: "ドキュメントセンター",
  description: "SHAMEZOのドキュメント・規約・お問い合わせ先の一覧",
};

const CONTACT_URL = "https://highemerly.net/contact.html";
const STATUS_URL = "https://status.highemerly.net";
const REPOSITORY_URL = "https://github.com/highemerly/movapic-neo";

const CARD_CLASS =
  "flex items-center justify-between gap-4 bg-muted rounded-lg p-4 hover:bg-muted/70 transition-colors";

function CardBody({
  label,
  description,
  Icon,
}: {
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function DocsLink({
  href,
  label,
  description,
  Icon,
}: {
  href: string;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link href={href} className={CARD_CLASS}>
      <CardBody label={label} description={description} Icon={Icon} />
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** 外部サイトへのリンク。行き先が SHAMEZO 外であることをアイコンで示す。 */
function ExternalDocsLink({
  href,
  label,
  description,
  Icon,
}: {
  href: string;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={CARD_CLASS}>
      <CardBody label={label} description={description} Icon={Icon} />
      <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    </a>
  );
}

export default async function DocsPage() {
  const user = await getCurrentUser();
  const latest = sortedReleaseNotes()[0];

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <PageContainer>

        <div className="flex items-baseline gap-2 mb-6">
          <h1 className="text-lg font-semibold">ドキュメントセンター</h1>
          <span className="text-xs text-muted-foreground tabular-nums">v{version}</span>
        </div>

        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">サービスについて</h2>
          <div className="space-y-3">
            <DocsLink
              href="/docs/spec"
              label="技術仕様"
              description="システム構成・画像処理・入力制限・テキスト合成・各機能の仕組みなど"
              Icon={Code}
            />
            {latest && (
              <DocsLink
                href={`/docs/release-note/${latest.version}`}
                label={`最新リリース（v${latest.version}）`}
                description={
                  latest.title
                    ? `${formatDate(latest.date)}・${latest.title}`
                    : `${formatDate(latest.date)} 公開の更新内容`
                }
                Icon={Sparkles}
              />
            )}
            <DocsLink
              href="/docs/release-note"
              label="リリースノート"
              description="すべての更新履歴"
              Icon={History}
            />
            <DocsLink
              href="/docs/emojis"
              label="カスタム絵文字"
              description="リアクションで使えるSHAMEZO独自の絵文字一覧"
              Icon={Smile}
            />
            <DocsLink
              href="/license"
              label="フォントライセンス"
              description="画像生成に使用しているフォントとそのライセンス"
              Icon={Type}
            />
            <DocsLink
              href="/stats"
              label="統計"
              description="投稿数・ユーザー数などのサービス全体の統計"
              Icon={ChartColumn}
            />
            <ExternalDocsLink
              href={REPOSITORY_URL}
              label="ソースコード"
              description="GitHub（外部サイト）"
              Icon={GitBranch}
            />
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">お知らせ・規約・サポート</h2>
          <div className="space-y-3">
            <DocsLink
              href="/announcements"
              label="お知らせ"
              description="運営からのお知らせ一覧"
              Icon={Megaphone}
            />
            <DocsLink
              href="/terms"
              label="利用規約"
              description="本サービスの利用条件"
              Icon={ScrollText}
            />
            <DocsLink
              href="/privacy"
              label="プライバシーポリシー"
              description="取得する情報とその取り扱い"
              Icon={ShieldCheck}
            />
            <DocsLink
              href="/docs/permissions"
              label="トークンに必要な権限"
              description="ログイン時にFediverseサーバーへ要求する権限スコープと用途"
              Icon={KeyRound}
            />
            <ExternalDocsLink
              href={STATUS_URL}
              label="運営ステータス"
              description="サービスの稼働状況・障害情報（外部サイト）"
              Icon={Activity}
            />
            <ExternalDocsLink
              href={CONTACT_URL}
              label="お問い合わせ"
              description="運営者の問い合わせフォーム（外部サイト）"
              Icon={Mail}
            />
          </div>
        </section>

        <Footer />
      </PageContainer>
    </>
  );
}
