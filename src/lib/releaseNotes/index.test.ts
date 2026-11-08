import { describe, it, expect } from "vitest";
import generated from "@/data/releaseNotes-generated.json";
import { LEGACY_RELEASE_NOTES } from "@/data/releaseNotes";
import { allReleaseNotes, findReleaseNote, formatReleasedAt, groupByMinor } from "./index";
import { CHANGE_TYPES, parseVersion } from "./rules";

describe("releaseNotes-generated.json", () => {
  it("リポジトリでは空の配列（タグのビルドだけが上書きする）", () => {
    expect(generated).toEqual([]);
  });
});

describe("LEGACY_RELEASE_NOTES", () => {
  it("版が重複しない", () => {
    const versions = LEGACY_RELEASE_NOTES.map((n) => n.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("どの版にも載せるものがある（無い版は書かない）", () => {
    for (const note of LEGACY_RELEASE_NOTES) {
      expect(CHANGE_TYPES.some((t) => (note[t]?.length ?? 0) > 0), note.version).toBe(true);
    }
  });

  it("X.Y.Z の版は時刻を、マイナーごとの版は日付を持つ", () => {
    for (const note of LEGACY_RELEASE_NOTES) {
      if (parseVersion(note.version)) expect(note.releasedAt, note.version).toMatch(/\+09:00$/);
      else expect(note.date, note.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("allReleaseNotes / groupByMinor", () => {
  it("新しい版から並べ、1.4 のまとめは 1.4.1 より後ろ（1.4.0 として）", () => {
    const versions = allReleaseNotes().map((n) => n.version);
    expect(versions[0]).toBe("1.5.5");
    expect(versions.indexOf("1.4")).toBe(versions.indexOf("1.4.1") + 1);
    expect(versions.indexOf("1.4.10")).toBeLessThan(versions.indexOf("1.4.9"));
  });

  it("マイナーの版ごとにまとめる", () => {
    const groups = groupByMinor([
      { version: "1.5.1" },
      { version: "1.5.0" },
      { version: "1.4.2" },
      { version: "1.4" },
      { version: "1.3" },
    ]);
    expect(groups.map((g) => [g.minor, g.notes.map((n) => n.version)])).toEqual([
      ["1.5", ["1.5.1", "1.5.0"]],
      ["1.4", ["1.4.2", "1.4"]],
      ["1.3", ["1.3"]],
    ]);
  });

  it("「1.5」のまとめは版ごとの記事に置き換えたので無い", () => {
    expect(findReleaseNote("1.5")).toBeUndefined();
    expect(findReleaseNote("1.4.12")?.add?.length).toBeGreaterThan(0);
  });
});

describe("formatReleasedAt", () => {
  it("時刻のある版は JST の日時、1.4 までは日付", () => {
    expect(formatReleasedAt({ version: "1.5.5", releasedAt: "2026-11-05T23:46:29Z" })).toBe("2026/11/6 8:46");
    expect(formatReleasedAt({ version: "1.4", date: "2026-07-28" })).toBe("2026/7/28");
  });
});
