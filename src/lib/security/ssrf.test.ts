import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// dns/promises.lookup をモックして DNS 解決経路を制御する。
vi.mock("dns/promises", () => ({ lookup: vi.fn() }));

import { lookup } from "dns/promises";
import { isBlockedIP, assertSafeRemoteHost, assertSafeRemoteUrl, SsrfError } from "./ssrf";

const mockLookup = lookup as unknown as Mock;

describe("isBlockedIP", () => {
  describe("IPv4: 内部・予約済みをブロック", () => {
    it.each([
      ["0.0.0.0", "このネットワーク 0.0.0.0/8"],
      ["0.1.2.3", "0.0.0.0/8"],
      ["10.0.0.1", "プライベート 10/8"],
      ["10.255.255.255", "プライベート 10/8 上端"],
      ["127.0.0.1", "ループバック 127/8"],
      ["127.9.9.9", "ループバック 127/8"],
      ["169.254.1.1", "リンクローカル 169.254/16"],
      ["172.16.0.1", "プライベート 172.16/12 下端"],
      ["172.31.255.255", "プライベート 172.16/12 上端"],
      ["192.168.0.1", "プライベート 192.168/16"],
      ["100.64.0.1", "CGNAT 100.64/10 下端"],
      ["100.127.255.255", "CGNAT 100.64/10 上端"],
      ["192.0.0.1", "IETF 192.0.0/24"],
      ["224.0.0.1", "マルチキャスト 224/4"],
      ["239.255.255.255", "マルチキャスト 224/4 上端"],
      ["240.0.0.1", "予約 240/4"],
      ["255.255.255.255", "ブロードキャスト"],
    ])("%s をブロック（%s）", (ip) => {
      expect(isBlockedIP(ip)).toBe(true);
    });
  });

  describe("IPv4: 公開アドレスは許可", () => {
    it.each([
      ["8.8.8.8"],
      ["1.1.1.1"],
      ["126.0.0.1"], // 127/8 の直前
      ["128.0.0.1"], // 127/8 の直後
      ["172.15.255.255"], // 172.16/12 の直前
      ["172.32.0.1"], // 172.16/12 の直後
      ["192.169.0.1"], // 192.168/16 の直後
      ["192.0.1.1"], // 192.0.0/24 は /24 のみ。192.0.1.x は公開
      ["100.63.255.255"], // CGNAT の直前
      ["100.128.0.1"], // CGNAT の直後
      ["223.255.255.255"], // 224/4 の直前
    ])("%s を許可", (ip) => {
      expect(isBlockedIP(ip)).toBe(false);
    });
  });

  describe("IPv6", () => {
    it.each([
      ["::1", "ループバック"],
      ["::", "未指定"],
      ["fe80::1", "リンクローカル"],
      ["fc00::1", "ユニークローカル fc00::/7"],
      ["fd12:3456::1", "ユニークローカル fd"],
      ["::ffff:127.0.0.1", "IPv4射影→ループバック"],
      ["::ffff:10.0.0.1", "IPv4射影→プライベート"],
    ])("%s をブロック（%s）", (ip) => {
      expect(isBlockedIP(ip)).toBe(true);
    });

    it.each([
      ["2001:4860:4860::8888", "公開IPv6（Google DNS）"],
      ["::ffff:8.8.8.8", "IPv4射影→公開"],
    ])("%s を許可（%s）", (ip) => {
      expect(isBlockedIP(ip)).toBe(false);
    });
  });

  describe("IPとして解釈できない文字列はブロック", () => {
    it.each([["notanip"], [""], ["999.1.1.1"], ["example.com"], ["10.0.0"]])(
      "%s をブロック",
      (s) => {
        expect(isBlockedIP(s)).toBe(true);
      }
    );
  });
});

describe("assertSafeRemoteHost", () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it("空ホスト名は SsrfError", async () => {
    await expect(assertSafeRemoteHost("")).rejects.toThrow(SsrfError);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("IPリテラル（内部）はDNSを引かずにブロック", async () => {
    await expect(assertSafeRemoteHost("127.0.0.1")).rejects.toThrow(SsrfError);
    await expect(assertSafeRemoteHost("::1")).rejects.toThrow(SsrfError);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("IPリテラル（公開）はDNSを引かずに許可", async () => {
    await expect(assertSafeRemoteHost("8.8.8.8")).resolves.toBeUndefined();
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it.each([["localhost"], ["foo.localhost"], ["db.local"], ["svc.internal"]])(
    "内部名 %s はDNSを引かずにブロック",
    async (host) => {
      await expect(assertSafeRemoteHost(host)).rejects.toThrow(SsrfError);
      expect(mockLookup).not.toHaveBeenCalled();
    }
  );

  it("大文字混じりの内部名もブロック（小文字化して判定）", async () => {
    await expect(assertSafeRemoteHost("LOCALHOST")).rejects.toThrow(SsrfError);
    await expect(assertSafeRemoteHost("Foo.Internal")).rejects.toThrow(SsrfError);
  });

  it("全解決先が公開アドレスなら許可", async () => {
    mockLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1::1", family: 6 },
    ]);
    await expect(assertSafeRemoteHost("example.com")).resolves.toBeUndefined();
    expect(mockLookup).toHaveBeenCalledWith("example.com", { all: true });
  });

  it("解決先に1つでも内部アドレスがあればブロック（DNSリバインディング/複数A対策）", async () => {
    mockLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(assertSafeRemoteHost("evil.example.com")).rejects.toThrow(SsrfError);
  });

  it("解決先が空配列なら解決失敗として扱う", async () => {
    mockLookup.mockResolvedValue([]);
    await expect(assertSafeRemoteHost("void.example.com")).rejects.toThrow(
      "ホスト名を解決できませんでした"
    );
  });

  it("DNS解決が例外なら解決失敗として扱う", async () => {
    mockLookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertSafeRemoteHost("nx.example.com")).rejects.toThrow(
      "ホスト名を解決できませんでした"
    );
  });
});

describe("assertSafeRemoteUrl", () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it("不正なURLは SsrfError", async () => {
    await expect(assertSafeRemoteUrl("not a url")).rejects.toThrow("不正なURLです");
  });

  it("https以外は拒否", async () => {
    await expect(assertSafeRemoteUrl("http://example.com/")).rejects.toThrow(
      "httpsのURLのみ許可されています"
    );
    await expect(assertSafeRemoteUrl("ftp://example.com/")).rejects.toThrow(SsrfError);
  });

  it("https＋内部IPv4リテラルは拒否（DNS不要）", async () => {
    await expect(assertSafeRemoteUrl("https://127.0.0.1/x")).rejects.toThrow(SsrfError);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("ブラケット付きIPv6リテラルは名前解決に回り、解決失敗としてブロックされる", async () => {
    // new URL(...).hostname は "[::1]"（ブラケット付き）を返し net.isIP=0 のため
    // IPリテラル分岐に入らず DNS へ。実環境では解決に失敗して SsrfError になる。
    mockLookup.mockRejectedValue(new Error("invalid hostname"));
    await expect(assertSafeRemoteUrl("https://[::1]/x")).rejects.toThrow(SsrfError);
  });

  it("https＋公開ホストは URL を返す", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const url = await assertSafeRemoteUrl("https://example.com/path?q=1");
    expect(url).toBeInstanceOf(URL);
    expect(url.hostname).toBe("example.com");
    expect(url.pathname).toBe("/path");
  });
});
