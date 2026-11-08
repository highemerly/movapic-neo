import { describe, it, expect } from "vitest";
import {
  assembleChanges,
  compareVersions,
  isNoServiceChange,
  MINOR_CHANGES,
  noteVersion,
  parseReleaseNoteBlock,
  parseVersion,
  type PullRequest,
} from "./rules";

const pr = (body: string | null, files: string[] | null = ["src/app/page.tsx"], number = 1): PullRequest => ({
  number,
  title: "Some change",
  body,
  files,
});

describe("parseReleaseNoteBlock", () => {
  it("ブロックの行を種別と文に分ける", () => {
    const body = "## Summary\nText\n\n```release-note\nadd: 機能を追加しました。\nfix:  不具合を修正しました。 \n```\n";
    expect(parseReleaseNoteBlock(body)).toEqual({
      found: true,
      changes: [
        { type: "add", text: "機能を追加しました。" },
        { type: "fix", text: "不具合を修正しました。" },
      ],
      invalid: [],
    });
  });

  it("空のブロックは「載せるものはない」の明示として found になる", () => {
    expect(parseReleaseNoteBlock("```release-note\n```")).toEqual({ found: true, changes: [], invalid: [] });
  });

  it("HTML コメントの中の見本は拾わない", () => {
    const body = "<!--\n```release-note\nfix: 見本\n```\n-->";
    expect(parseReleaseNoteBlock(body).found).toBe(false);
  });

  it("読めない行（remove や種別なし）は invalid に入れる", () => {
    const result = parseReleaseNoteBlock("```release-note\nremove: 消した\nただの文\n```");
    expect(result.changes).toEqual([]);
    expect(result.invalid).toEqual(["remove: 消した", "ただの文"]);
  });

  it("本文が null でも落ちない", () => {
    expect(parseReleaseNoteBlock(null).found).toBe(false);
  });
});

describe("isNoServiceChange", () => {
  it("ドキュメント・CI・E2E・テスト・Email Worker だけなら true", () => {
    expect(
      isNoServiceChange([
        "README.md",
        "docs/development.md",
        ".github/workflows/ci.yml",
        ".claude/settings.json",
        ".githooks/pre-commit",
        "e2e/smoke.spec.ts",
        "workers/email/index.ts",
        "src/lib/jst.test.ts",
        "src/lib/image/overlay.golden.test.ts",
        "src/lib/image/__golden__/top.png",
        "src/lib/email/__fixtures__/1-docomo.eml",
        ".gitignore",
        "vitest.config.ts",
      ]),
    ).toBe(true);
  });

  it("アプリのソース・依存・Dockerfile が1つでもあれば false", () => {
    expect(isNoServiceChange(["docs/a.md", "src/lib/jst.ts"])).toBe(false);
    expect(isNoServiceChange(["package-lock.json"])).toBe(false);
    expect(isNoServiceChange(["Dockerfile"])).toBe(false);
  });

  it("ファイルが分からない・空のときは false（変えるものとして扱う）", () => {
    expect(isNoServiceChange(null)).toBe(false);
    expect(isNoServiceChange([])).toBe(false);
  });
});

describe("assembleChanges", () => {
  it("ブロックの行を種別ごとに古い PR から並べる", () => {
    const result = assembleChanges([
      pr("```release-note\nfix: A を修正しました。\nchange: B を変更しました。\n```", undefined, 1),
      pr("```release-note\nadd: C を追加しました。\nfix: D を修正しました。\n```", undefined, 2),
    ]);
    expect(result.changes).toEqual({
      add: ["C を追加しました。"],
      fix: ["A を修正しました。", "D を修正しました。"],
      change: ["B を変更しました。"],
    });
    expect(result.hasChanges).toBe(true);
    expect(result.minor).toEqual([]);
  });

  it("同じ文は版の中で1行にまとめる", () => {
    const block = "```release-note\nfix: セキュリティを改善しました。\n```";
    expect(assembleChanges([pr(block, undefined, 1), pr(block, undefined, 2)]).changes).toEqual({
      fix: ["セキュリティを改善しました。"],
    });
  });

  it("ブロックの無い PR は「その他の軽微な修正」1行にまとめ、Fix の最後に置く", () => {
    const result = assembleChanges([
      pr(null, ["package-lock.json"], 1),
      pr("```release-note\nfix: A を修正しました。\n```", undefined, 2),
      pr("No block", ["src/lib/jst.ts"], 3),
    ]);
    expect(result.changes).toEqual({ fix: ["A を修正しました。", MINOR_CHANGES] });
    expect(result.minor.map((p) => p.number)).toEqual([1, 3]);
  });

  it("ブロックに「その他の軽微な修正」を書いても最後に1行だけ", () => {
    const result = assembleChanges([
      pr(`\`\`\`release-note\nfix: ${MINOR_CHANGES}\nfix: A を修正しました。\n\`\`\``, undefined, 1),
      pr(null, undefined, 2),
    ]);
    expect(result.changes).toEqual({ fix: ["A を修正しました。", MINOR_CHANGES] });
  });

  it("サービスを変えない PR はブロックが無くても数えない", () => {
    const result = assembleChanges([pr(null, [".github/workflows/ci.yml"], 1), pr(null, ["docs/api.md"], 2)]);
    expect(result.hasChanges).toBe(false);
    expect(result.changes).toEqual({});
    expect(result.minor).toEqual([]);
  });

  it("空のブロックの PR は何も載せない", () => {
    const result = assembleChanges([pr("```release-note\n```", ["src/lib/jst.ts"])]);
    expect(result.hasChanges).toBe(false);
  });

  it("読めない行は PR ごとに返す", () => {
    const p = pr("```release-note\nremove: 消した\n```");
    expect(assembleChanges([p]).invalid).toEqual([{ pr: p, line: "remove: 消した" }]);
  });
});

describe("parseVersion / compareVersions / noteVersion", () => {
  it("v 付き・無しの X.Y.Z を読み、それ以外は null", () => {
    expect(parseVersion("v1.5.5")).toEqual([1, 5, 5]);
    expect(parseVersion("1.10.0")).toEqual([1, 10, 0]);
    expect(parseVersion("1.5")).toBeNull();
    expect(parseVersion("v1.5.5-rc1")).toBeNull();
  });

  it("数値として比べる（1.10 > 1.9）", () => {
    expect(compareVersions([1, 10, 0], [1, 9, 9])).toBeGreaterThan(0);
    expect(compareVersions([1, 4, 2], [1, 4, 2])).toBe(0);
  });

  it("マイナーごとのノート（1.4）は 1.4.0 として扱う", () => {
    expect(noteVersion("1.4")).toEqual([1, 4, 0]);
    expect(compareVersions(noteVersion("1.4.1"), noteVersion("1.4"))).toBeGreaterThan(0);
  });
});
