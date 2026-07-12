import { describe, it, expect } from "vitest";
import { parseUserAgent } from "./uaParser";

// 代表的な実 UA 文字列
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ipadSafari:
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  chromeIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1",
  chromeOS:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  linuxFirefox:
    "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
  opera:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0",
  iosWebview:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

describe("parseUserAgent: OS判定（優先順位が肝）", () => {
  it("iPhone/iPad は Mac 表記より先に判定される", () => {
    expect(parseUserAgent(UA.iphoneSafari).os).toBe("iOS");
    expect(parseUserAgent(UA.ipadSafari).os).toBe("iPadOS");
  });
  it("Android は Linux より先に判定される", () => {
    expect(parseUserAgent(UA.androidChrome).os).toBe("Android");
  });
  it("ChromeOS(CrOS) は Linux より先に判定される", () => {
    expect(parseUserAgent(UA.chromeOS).os).toBe("ChromeOS");
  });
  it("macOS / Windows / Linux", () => {
    expect(parseUserAgent(UA.macSafari).os).toBe("macOS");
    expect(parseUserAgent(UA.windowsChrome).os).toBe("Windows");
    expect(parseUserAgent(UA.linuxFirefox).os).toBe("Linux");
  });
});

describe("parseUserAgent: ブラウザ判定（Chrome を名乗る派生を先に）", () => {
  it("Edge / Opera は Chrome より先に判定される", () => {
    expect(parseUserAgent(UA.windowsEdge).browser).toBe("Edge");
    expect(parseUserAgent(UA.opera).browser).toBe("Opera");
  });
  it("iOS版 Chrome(CriOS) は Safari と区別する", () => {
    expect(parseUserAgent(UA.chromeIOS).browser).toBe("Chrome (iOS)");
  });
  it("Firefox / Chrome / Safari", () => {
    expect(parseUserAgent(UA.windowsFirefox).browser).toBe("Firefox");
    expect(parseUserAgent(UA.windowsChrome).browser).toBe("Chrome");
    expect(parseUserAgent(UA.macSafari).browser).toBe("Safari");
  });
  it("Version/ を持たない WebView は Safari と誤判定しない", () => {
    const r = parseUserAgent(UA.iosWebview);
    expect(r.os).toBe("iOS");
    expect(r.browser).toBe("不明");
  });
});

describe("parseUserAgent: フォールバック", () => {
  it("null は不明", () => {
    expect(parseUserAgent(null)).toEqual({ browser: "不明", os: "不明" });
  });
  it("未知の UA は不明", () => {
    expect(parseUserAgent("curl/8.0.1")).toEqual({ browser: "不明", os: "不明" });
  });
});
