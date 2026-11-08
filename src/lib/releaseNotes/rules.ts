/*
  アプリ内のリリースノート（/docs/release-note）の形と、PR から版ごとの変更を組み立てる規則。

  v1.5.5 までは src/data/releaseNotes.ts に手で書いてある。それより後は、タグのビルド
  （docker-build.yml）が scripts/release-notes.ts で PR 本文の `release-note` ブロックから作り、
  src/data/releaseNotes-generated.json としてイメージに焼き込む。

  **ここから何も import しない。** スクリプトは素の node（型を消すだけ）で動くので、
  `@/` も拡張子なしの相対 import も解決できない。
*/

export type ChangeType = "add" | "fix" | "change";

export type ReleaseNote = {
  /** "1.5.5"。マイナーごとにまとめて書いていた頃（1.4 まで）は "1.4" */
  version: string;
  /** 時刻を持たない版（1.4 まで）の日付。YYYY-MM-DD */
  date?: string;
  /** リリースした時刻（ISO 8601）。1.4.1 から */
  releasedAt?: string;
  /** GitHub Release。作られていない版もある */
  url?: string;
  add?: string[];
  fix?: string[];
  change?: string[];
};

/** 版の中の並び（画面の Add / Fix / Change の順） */
export const CHANGE_TYPES: readonly ChangeType[] = ["add", "fix", "change"];

/**
 * ブロックの無い PR をまとめる1行。書き忘れた PR もここに入る
 * （何も出ないよりは、何か変わったことが伝わる）。
 */
export const MINOR_CHANGES = "その他の軽微な修正を行いました。";

/*
  動いているサービスを変えないファイル。PR の変更がこれだけなら、ブロックが無くても
  「その他の軽微な修正」に数えない。題名の接頭辞（ci: など）は使っていないので、ファイルで決める。
  workers/ は Cloudflare Email Worker（本番イメージに入らず、別に手でデプロイする）。
*/
const NO_SERVICE_CHANGE_DIRS = ["docs/", ".github/", ".claude/", ".githooks/", "e2e/", "workers/"];
const NO_SERVICE_CHANGE_FILE = /(\.md|\.test\.tsx?|^LICENSE|^\.gitignore|^vitest\.config\.ts)$|\/(__golden__|__fixtures__)\//;

/** 変更したファイルが全部サービスを変えないものか。一覧が分からない（null）ときは変えるものとして扱う */
export function isNoServiceChange(paths: readonly string[] | null): boolean {
  if (!paths || paths.length === 0) return false;
  return paths.every(
    (p) => NO_SERVICE_CHANGE_DIRS.some((dir) => p.startsWith(dir)) || NO_SERVICE_CHANGE_FILE.test(p),
  );
}

const BLOCK = /^```release-note[ \t]*\r?\n([\s\S]*?)^```/gm;
const LINE = /^(add|fix|change):\s*(.+)$/;

export type ParsedBlock = {
  /** ブロックがあったか。空のブロックは「載せるものはない」の明示 */
  found: boolean;
  changes: { type: ChangeType; text: string }[];
  /** 読めなかった行 */
  invalid: string[];
};

export function parseReleaseNoteBlock(body: string | null | undefined): ParsedBlock {
  const result: ParsedBlock = { found: false, changes: [], invalid: [] };
  // PR テンプレートの書き方の見本（HTML コメントの中）は拾わない
  const visible = (body ?? "").replace(/<!--[\s\S]*?-->/g, "");
  for (const match of visible.matchAll(BLOCK)) {
    result.found = true;
    for (const raw of match[1].split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = LINE.exec(line);
      if (m) result.changes.push({ type: m[1] as ChangeType, text: m[2].trim() });
      else result.invalid.push(line);
    }
  }
  return result;
}

export type PullRequest = {
  /** squash でないコミットなど、PR の無いものは null */
  number: number | null;
  title: string;
  body: string | null;
  /** 変更したファイル。分からなければ null */
  files: string[] | null;
};

export type AssembledChanges = {
  changes: Pick<ReleaseNote, ChangeType>;
  /** 載せるものが1つでもあるか。無い版は出さない */
  hasChanges: boolean;
  /** 「その他の軽微な修正」に数えた PR */
  minor: PullRequest[];
  invalid: { pr: PullRequest; line: string }[];
};

/**
 * 1つの版に入った PR（古い順）から、載せる変更を組み立てる。
 * 同じ文は1行にまとめ（セキュリティの修正が何件あっても同じ文なら1行）、種別の順に並べ、
 * ブロックの無い PR があれば Fix の最後に「その他の軽微な修正」を足す。
 */
export function assembleChanges(prs: PullRequest[]): AssembledChanges {
  const lists: Record<ChangeType, string[]> = { add: [], fix: [], change: [] };
  const minor: PullRequest[] = [];
  const invalid: AssembledChanges["invalid"] = [];
  // ブロックに同じ文を書いた PR があっても、「その他の軽微な修正」は Fix の最後に1行だけ
  let minorWritten = false;

  for (const pr of prs) {
    const block = parseReleaseNoteBlock(pr.body);
    for (const line of block.invalid) invalid.push({ pr, line });
    if (block.found) {
      for (const c of block.changes) {
        if (c.text === MINOR_CHANGES) minorWritten = true;
        else if (!lists[c.type].includes(c.text)) lists[c.type].push(c.text);
      }
    } else if (!isNoServiceChange(pr.files)) {
      minor.push(pr);
    }
  }
  if (minor.length > 0 || minorWritten) lists.fix.push(MINOR_CHANGES);

  const changes: Pick<ReleaseNote, ChangeType> = {};
  for (const t of CHANGE_TYPES) if (lists[t].length > 0) changes[t] = lists[t];
  return { changes, hasChanges: CHANGE_TYPES.some((t) => lists[t].length > 0), minor, invalid };
}

export type Version = [number, number, number];

/** `v1.5.5` / `1.5.5` を [1, 5, 5] に。形が違えば null */
export function parseVersion(tag: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** ノートの版（"1.5.5"・マイナーごとの "1.4"＝1.4.0 で出したもの）を比べられる形に */
export function noteVersion(version: string): Version {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map((n) => parseInt(n, 10) || 0);
  return [major, minor, patch];
}
