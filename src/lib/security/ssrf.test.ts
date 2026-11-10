import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";

// dns/promises.lookup をモックして DNS 解決経路を制御する。
vi.mock("dns/promises", () => ({ lookup: vi.fn() }));

import { lookup } from "dns/promises";
import {
  isBlockedIP,
  assertSafeRemoteHost,
  assertSafeRemoteUrl,
  remoteFetch,
  safeFetch,
  SsrfError,
  limitResponseBody,
  ResponseTooLargeError,
} from "./ssrf";

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
      ["198.18.0.1", "ベンチマーク 198.18/15 下端"],
      ["198.19.255.255", "ベンチマーク 198.18/15 上端"],
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
      ["198.17.255.255"], // 198.18/15 の直前
      ["198.20.0.1"], // 198.18/15 の直後
      ["198.51.100.10"], // TEST-NET-2。E2E の偽 Fediverse がここで動く
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
      ["::ffff:7f00:1", "IPv4射影の16進表記→ループバック（URL はこの表記に正規化する）"],
      ["::7f00:1", "IPv4互換（廃止）"],
      ["fe90::1", "リンクローカル fe80::/10 の途中"],
      ["febf:ffff::1", "リンクローカル fe80::/10 の上端"],
      ["fec0::1", "サイトローカル（廃止）"],
      ["ff02::1", "マルチキャスト"],
      ["64:ff9b::7f00:1", "NAT64 に埋め込んだ 127.0.0.1"],
      ["64:ff9b::a9fe:a9fe", "NAT64 に埋め込んだメタデータIP"],
      ["64:ff9b:1::1", "NAT64 のローカル用"],
      ["2002:7f00:1::1", "6to4 に埋め込んだ 127.0.0.1"],
      ["2002:a00:1::1", "6to4 に埋め込んだ 10.0.0.1"],
      ["2001::1", "Teredo"],
      ["100::1", "破棄専用"],
      ["fe80::1%eth0", "ゾーンID付き"],
    ])("%s をブロック（%s）", (ip) => {
      expect(isBlockedIP(ip)).toBe(true);
    });

    it.each([
      ["2001:4860:4860::8888", "公開IPv6（Google DNS）"],
      ["::ffff:8.8.8.8", "IPv4射影→公開"],
      ["64:ff9b::808:808", "NAT64 に埋め込んだ公開IP（DNS64 の網から IPv4 のインスタンスへ届く）"],
      ["2002:808:808::1", "6to4 に埋め込んだ公開IP"],
      ["2001:db8::1", "ドキュメント用（内部ではない）"],
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

describe("safeFetch", () => {
  const mockFetch = vi.fn();

  // 公開ホストは公開IPに、"internal.example" だけ内部IPに解決させる
  beforeEach(() => {
    mockLookup.mockReset();
    mockLookup.mockImplementation(async (host: string) =>
      host === "internal.example" ? [{ address: "10.0.0.5" }] : [{ address: "93.184.216.34" }]
    );
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  const redirect = (status: number, location: string) =>
    new Response(null, { status, headers: { location } });
  const ok = () => new Response("{}", { status: 200 });
  const calledUrl = (i: number) => String(mockFetch.mock.calls[i][0]);
  const calledInit = (i: number) => mockFetch.mock.calls[i][1] as RequestInit;

  it("リダイレクトが無ければそのまま返し、自動追従はさせない", async () => {
    mockFetch.mockResolvedValueOnce(ok());
    const res = await safeFetch("https://a.example/api");
    expect(res.status).toBe(200);
    expect(calledInit(0).redirect).toBe("manual");
  });

  it("公開ホストへの転送はたどり、転送先も名前解決して検証する", async () => {
    mockFetch.mockResolvedValueOnce(redirect(301, "https://b.example/api")).mockResolvedValueOnce(ok());
    const res = await safeFetch("https://a.example/api");
    expect(res.status).toBe(200);
    expect(calledUrl(1)).toBe("https://b.example/api");
    expect(mockLookup).toHaveBeenCalledWith("b.example", { all: true });
  });

  it("http への転送は送らずに拒否する（https→http で内部の平文サービスへ届いた再現ケース）", async () => {
    mockFetch.mockResolvedValueOnce(redirect(307, "http://127.0.0.1:8080/secret"));
    await expect(safeFetch("https://a.example/api")).rejects.toBeInstanceOf(SsrfError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("内部IPリテラル・内部に解決されるホストへの転送は拒否する", async () => {
    mockFetch.mockResolvedValueOnce(redirect(302, "https://169.254.169.254/v1.json"));
    await expect(safeFetch("https://a.example/api")).rejects.toBeInstanceOf(SsrfError);
    mockFetch.mockResolvedValueOnce(redirect(302, "https://internal.example/"));
    await expect(safeFetch("https://a.example/api")).rejects.toBeInstanceOf(SsrfError);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("最初の宛先が http なら送らない", async () => {
    await expect(safeFetch("http://a.example/api")).rejects.toBeInstanceOf(SsrfError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("307 はメソッドと本文を保ち、302 の POST は GET にして本文を落とす（fetch 仕様と同じ）", async () => {
    const init = { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } };
    mockFetch.mockResolvedValueOnce(redirect(307, "/v2")).mockResolvedValueOnce(ok());
    await safeFetch("https://a.example/v1", init);
    expect(calledInit(1).method).toBe("POST");
    expect(calledInit(1).body).toBe("{}");

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(redirect(302, "/v2")).mockResolvedValueOnce(ok());
    await safeFetch("https://a.example/v1", init);
    expect(calledInit(1).method).toBe("GET");
    expect(calledInit(1).body).toBeUndefined();
    expect((calledInit(1).headers as Headers).has("content-type")).toBe(false);
  });

  it("別オリジンへ移るときは Authorization を外し、同一オリジン内なら保つ", async () => {
    const init = { headers: { Authorization: "Bearer secret" } };
    mockFetch.mockResolvedValueOnce(redirect(302, "/me")).mockResolvedValueOnce(ok());
    await safeFetch("https://a.example/api", init);
    expect((calledInit(1).headers as Headers).get("authorization")).toBe("Bearer secret");

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(redirect(302, "https://b.example/me")).mockResolvedValueOnce(ok());
    await safeFetch("https://a.example/api", init);
    expect((calledInit(1).headers as Headers).has("authorization")).toBe(false);
  });

  it("転送が上限（5回）を超えたら拒否する", async () => {
    mockFetch.mockImplementation(async () => redirect(302, "https://a.example/loop"));
    await expect(safeFetch("https://a.example/loop")).rejects.toBeInstanceOf(SsrfError);
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });
});

describe("remoteFetch: 接続の直前に接続先IPを検査する", () => {
  // 本物のソケットで確かめる（dispatcher の配線が切れていても fetch のモックでは気づけないため）。
  // 127.0.0.1 で待ち受け、届いたら記録する。
  let server: Server;
  let port: number;
  let hits = 0;

  beforeEach(async () => {
    vi.unstubAllGlobals();
    hits = 0;
    server = createServer((_req, res) => {
      hits++;
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
    return () => new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const causeOf = async (p: Promise<unknown>) => {
    const error = await p.then(
      () => null,
      (e: unknown) => e
    );
    return (error as { cause?: unknown } | null)?.cause;
  };

  it("IP 直指定の内部アドレスには接続しない（リダイレクト先の http://127.0.0.1 と同じ経路）", async () => {
    const cause = await causeOf(remoteFetch(`http://127.0.0.1:${port}/`));
    expect(cause).toBeInstanceOf(SsrfError);
    expect(hits).toBe(0);
  });

  it("内部アドレスに解決される名前には接続しない（DNS の再バインドと同じ経路）", async () => {
    const cause = await causeOf(remoteFetch(`http://localhost:${port}/`));
    expect(cause).toBeInstanceOf(SsrfError);
    expect(hits).toBe(0);
  });

  it("ガードを通さない素の fetch なら届く（上の2つがサーバー側の都合で落ちたのではないことの確認）", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(await res.text()).toBe("ok");
    expect(hits).toBe(1);
  });

  it("undici のメジャーが Node 組み込みの fetch と同じ（違うと remoteFetch が全部失敗する）", () => {
    const { version } = JSON.parse(
      readFileSync(new URL("../../../node_modules/undici/package.json", import.meta.url), "utf8")
    ) as { version: string };
    expect(version.split(".")[0]).toBe(process.versions.undici?.split(".")[0]);
  });
});

describe("limitResponseBody: 応答の本文の上限", () => {
  // Content-Length を付けずに少しずつ流す（相手が大きさを申告しない場合）
  const streamed = (chunks: number[]) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const n of chunks) controller.enqueue(new Uint8Array(n));
          controller.close();
        },
      }),
      { status: 200 }
    );

  it("上限以内ならそのまま読める（状態とヘッダも保つ）", async () => {
    const res = limitResponseBody(
      new Response('{"a":1}', { status: 201, headers: { "x-test": "1" } }),
      100
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("x-test")).toBe("1");
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("ちょうど上限までは読める", async () => {
    const res = limitResponseBody(streamed([40, 60]), 100);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  it("申告なしで上限を超えて流れてきたら、読んでいる途中で止める", async () => {
    const res = limitResponseBody(streamed([60, 60]), 100);
    await expect(res.arrayBuffer()).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("Content-Length が上限を超えていれば読む前に断る", () => {
    const res = new Response("x".repeat(200), { headers: { "content-length": "200" } });
    expect(() => limitResponseBody(res, 100)).toThrow(ResponseTooLargeError);
  });

  it("本文の無い応答（204 など）はそのまま返す", () => {
    const res = new Response(null, { status: 204 });
    expect(limitResponseBody(res, 100)).toBe(res);
  });
});
