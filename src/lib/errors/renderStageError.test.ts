import { describe, it, expect } from "vitest";
import { parseRenderStageError } from "./renderStageError";

describe("parseRenderStageError", () => {
  it("stage と文言を取り出す", () => {
    expect(
      parseRenderStageError(JSON.stringify({ stage: "rotate", message: "画像の画素数が大きすぎます" }))
    ).toEqual({ stage: "rotate", message: "画像の画素数が大きすぎます" });
  });

  it("未知の stage は汎用の失敗として扱う", () => {
    expect(parseRenderStageError(JSON.stringify({ stage: "upload", message: "x" }))).toBeNull();
  });

  it("文言が無い・空なら汎用の失敗として扱う", () => {
    expect(parseRenderStageError(JSON.stringify({ stage: "rotate" }))).toBeNull();
    expect(parseRenderStageError(JSON.stringify({ stage: "rotate", message: "" }))).toBeNull();
  });

  it("JSON でない本文や null は汎用の失敗として扱う", () => {
    expect(parseRenderStageError("render failed")).toBeNull();
    expect(parseRenderStageError("null")).toBeNull();
  });
});
