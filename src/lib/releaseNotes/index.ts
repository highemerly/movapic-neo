import { LEGACY_RELEASE_NOTES } from "@/data/releaseNotes";
import generated from "@/data/releaseNotes-generated.json";
import { compareVersions, noteVersion, type ReleaseNote } from "./rules";

/*
  画面（/docs/release-note・/docs）が読むリリースノート。手で書いた分（v1.5.5 まで）と、
  タグのビルドが PR から作ってイメージに焼き込んだ分（releaseNotes-generated.json）を合わせる。
  リポジトリの JSON は空の配列なので、ブランチや手元では手で書いた分だけが出る。
  実行時に GitHub から読まないのは、Release がある版＝デプロイしてよい版で、デプロイ済みとは限らないため
  （読むとまだ出ていない変更が載る）。焼き込めば動いている版とノートが必ず一致する。
*/

/** 新しい版から */
export function allReleaseNotes(): ReleaseNote[] {
  return [...(generated as ReleaseNote[]), ...LEGACY_RELEASE_NOTES].sort((a, b) =>
    compareVersions(noteVersion(b.version), noteVersion(a.version)),
  );
}

export function findReleaseNote(version: string): ReleaseNote | undefined {
  return allReleaseNotes().find((n) => n.version === version);
}

export type ReleaseNoteGroup = { minor: string; notes: ReleaseNote[] };

/** マイナーの版ごとにまとめる（並びは allReleaseNotes のまま） */
export function groupByMinor(notes: ReleaseNote[]): ReleaseNoteGroup[] {
  const groups: ReleaseNoteGroup[] = [];
  for (const note of notes) {
    const [major, minor] = noteVersion(note.version);
    const key = `${major}.${minor}`;
    const last = groups.at(-1);
    if (last?.minor === key) last.notes.push(note);
    else groups.push({ minor: key, notes: [note] });
  }
  return groups;
}

const JST_DATE_TIME = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** 「2026/11/6 8:46」（時刻のある版）・「2026/7/28」（1.4 まで） */
export function formatReleasedAt(note: ReleaseNote): string {
  if (note.releasedAt) return JST_DATE_TIME.format(new Date(note.releasedAt));
  if (!note.date) return "";
  const [y, m, d] = note.date.split("-");
  return `${y}/${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

/** <time dateTime> 用 */
export function releasedAtAttr(note: ReleaseNote): string | undefined {
  return note.releasedAt ?? note.date;
}
