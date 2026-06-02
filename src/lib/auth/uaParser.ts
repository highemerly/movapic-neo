export type ParsedUA = {
  browser: string;
  os: string;
};

export function parseUserAgent(ua: string | null): ParsedUA {
  if (!ua) return { browser: "不明", os: "不明" };

  const os = detectOS(ua);
  const browser = detectBrowser(ua);
  return { browser, os };
}

function detectOS(ua: string): string {
  if (/iPad/.test(ua)) return "iPadOS";
  if (/iPhone|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/Windows NT/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "不明";
}

function detectBrowser(ua: string): string {
  // 判定順は重要: Edge/Opera/Brave などは Chrome を名乗るので先に判定
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/CriOS\//.test(ua)) return "Chrome (iOS)";
  if (/FxiOS\//.test(ua)) return "Firefox (iOS)";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return "不明";
}
