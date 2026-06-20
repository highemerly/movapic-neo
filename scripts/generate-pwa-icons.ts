/**
 * PWA用アイコンを生成する。
 *
 * 既存ロゴ（public/shamezo_logo.svg）は横長ワードマークで正方形アイコンに不向きなので、
 * ロゴと同じグラデーション・ケータイアイコンを流用しつつ、正方形向けに
 *   1行目: SHAME
 *   2行目: ZO（＋ケータイアイコン）
 * の2行レイアウトにした専用SVGを組み、白背景の正方形に合成して書き出す。
 *
 * 実行: npx tsx scripts/generate-pwa-icons.ts
 * 出力: public/icons/{icon-192,icon-512,icon-maskable-192,icon-maskable-512,apple-touch-icon}.png
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "icons");

// 白背景（manifest の background_color と一致させる）
const BG = { r: 255, g: 255, b: 255, alpha: 1 };

// ケータイアイコン（public/shamezo_logo.svg から流用。ローカル座標 x:[3,25] y:[-6,70] 付近）
const KEITAI = `
  <path d="M3,28 L3,8 Q3,0 10,0 L18,0 Q25,0 25,8 L25,28 Z" fill="none" stroke="url(#warm)" stroke-width="1.6" stroke-linejoin="round"/>
  <rect x="6" y="4" width="16" height="18" rx="1.5" fill="url(#warm)" opacity="0.18"/>
  <rect x="10" y="24" width="8" height="1.2" rx="0.6" fill="url(#warm)" opacity="0.4"/>
  <rect x="3" y="28" width="22" height="2.5" rx="1.25" fill="url(#blend)" opacity="0.4"/>
  <path d="M3,30.5 L3,62 Q3,70 10,70 L18,70 Q25,70 25,62 L25,30.5 Z" fill="none" stroke="url(#cool)" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="14" cy="36" r="3.5" fill="none" stroke="url(#cool)" stroke-width="1" opacity="0.45"/>
  <circle cx="14" cy="36" r="1" fill="url(#cool)" opacity="0.4"/>
  <rect x="5" y="33" width="4" height="2" rx="0.8" fill="url(#cool)" opacity="0.25"/>
  <rect x="19" y="33" width="4" height="2" rx="0.8" fill="url(#cool)" opacity="0.25"/>
  <circle cx="8" cy="44" r="1.4" fill="url(#cool)" opacity="0.3"/>
  <circle cx="14" cy="44" r="1.4" fill="url(#cool)" opacity="0.3"/>
  <circle cx="20" cy="44" r="1.4" fill="url(#cool)" opacity="0.3"/>
  <circle cx="8" cy="49.5" r="1.4" fill="url(#cool)" opacity="0.3"/>
  <circle cx="14" cy="49.5" r="1.4" fill="url(#cool)" opacity="0.3"/>
  <circle cx="20" cy="49.5" r="1.4" fill="url(#cool)" opacity="0.3"/>
  <circle cx="8" cy="55" r="1.4" fill="url(#cool)" opacity="0.3"/>
  <circle cx="14" cy="55" r="1.4" fill="url(#cool)" opacity="0.3"/>
  <circle cx="20" cy="55" r="1.4" fill="url(#cool)" opacity="0.3"/>
  <circle cx="8" cy="60.5" r="1.4" fill="url(#cool)" opacity="0.3"/>
  <circle cx="14" cy="60.5" r="1.4" fill="url(#cool)" opacity="0.3"/>
  <circle cx="20" cy="60.5" r="1.4" fill="url(#cool)" opacity="0.3"/>
  <circle cx="14" cy="-3" r="2.5" fill="none" stroke="url(#cool)" stroke-width="1.2"/>
  <circle cx="14" cy="-3" r="1.2" fill="url(#cool)" opacity="0.45"/>
  <rect x="21" y="-6" width="2.5" height="7" rx="1.25" fill="url(#warm)" opacity="0.35"/>
`;

// 正方形（200x200）2行レイアウトのアイコンSVG。透過背景（合成側で白を敷く）。
const ICON_SVG = `<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="warm" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F77062"/>
      <stop offset="50%" stop-color="#FE5196"/>
      <stop offset="100%" stop-color="#F5AF19"/>
    </linearGradient>
    <linearGradient id="cool" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4FACFE"/>
      <stop offset="100%" stop-color="#00F2FE"/>
    </linearGradient>
    <linearGradient id="blend" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F77062"/>
      <stop offset="50%" stop-color="#FE5196"/>
      <stop offset="100%" stop-color="#4FACFE"/>
    </linearGradient>
  </defs>

  <g font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-weight="800" letter-spacing="-3">
    <!-- 1行目: SHAME（200幅に収まるサイズ。大きすぎるとSの左が切れる） -->
    <text x="100" y="92" text-anchor="middle" font-size="55" fill="url(#warm)">SHAME</text>
    <!-- 2行目: ZO（中央やや左）＋ ケータイアイコン -->
    <text x="84" y="166" text-anchor="middle" font-size="55" fill="url(#cool)">ZO</text>
  </g>

  <!-- ケータイ: 2行目の右、ZOと高さを合わせる（少し間隔を空ける） -->
  <g transform="translate(128, 120)">
    <g transform="scale(0.78)">
      <g transform="rotate(16, 14, 32)">
        ${KEITAI}
      </g>
    </g>
  </g>
</svg>`;

/**
 * 正方形アイコンを1つ生成する。
 * @param size 出力ピクセル数（正方形）
 * @param contentFactor アートワークをアイコン幅の何割で描くか（マスカブルは小さめ＝余白多め）
 */
async function makeIcon(size: number, contentFactor: number): Promise<Buffer> {
  const artSize = Math.round(size * contentFactor);
  const art = await sharp(Buffer.from(ICON_SVG))
    .resize(artSize, artSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: art, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const targets: Array<{ name: string; size: number; contentFactor: number }> = [
    // purpose any: 余白控えめ
    { name: "icon-192.png", size: 192, contentFactor: 0.92 },
    { name: "icon-512.png", size: 512, contentFactor: 0.92 },
    // purpose maskable: OSが角丸/円形にクロップするため中央に寄せて余白多め
    { name: "icon-maskable-192.png", size: 192, contentFactor: 0.7 },
    { name: "icon-maskable-512.png", size: 512, contentFactor: 0.7 },
    // iOS apple-touch-icon（透過なし=白背景、180px）
    { name: "apple-touch-icon.png", size: 180, contentFactor: 0.92 },
  ];

  for (const t of targets) {
    const buf = await makeIcon(t.size, t.contentFactor);
    const outPath = path.join(OUT_DIR, t.name);
    await writeFile(outPath, buf);
    console.log(`✓ ${path.relative(ROOT, outPath)} (${t.size}x${t.size})`);
  }

  console.log("PWAアイコンの生成が完了しました。");
}

main().catch((err) => {
  console.error("アイコン生成に失敗しました:", err);
  process.exit(1);
});
