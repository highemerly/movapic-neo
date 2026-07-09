import type { FontLicense } from "@/lib/fonts/licenses";

/**
 * フォント1件分のライセンス表示カード。
 * `/license` ページ（一覧）と FontLicenseDialog（モーダル・単一）で共有する。
 * 描画専用（フックなし）なので Server / Client どちらからも使える。
 */
export function FontLicenseCard({ license }: { license: FontLicense }) {
  return (
    <div id={license.key} className="bg-muted rounded-lg p-4 scroll-mt-20">
      <p className="font-medium mb-2">{license.label}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={license.sampleSrc}
        alt={license.sampleAlt}
        width={license.sampleWidth}
        height={license.sampleHeight}
        className="w-full h-auto rounded-md border border-border mb-3 dark:invert"
      />
      {license.copyright.map((line, i) => (
        <p key={`c-${i}`} className="text-xs text-muted-foreground mb-2">
          {line}
        </p>
      ))}
      {license.body.map((line, i) => (
        <p key={`b-${i}`} className="text-sm text-muted-foreground mb-2">
          {line}
        </p>
      ))}
      {license.link && (
        <a
          href={license.link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
        >
          {license.link.label}
        </a>
      )}
      {license.note && (
        <p className="text-xs text-muted-foreground mt-2">{license.note}</p>
      )}
    </div>
  );
}
