/**
 * Device detection utilities for OpenSend v0.2.0.
 * Returns platform, OS, browser, and device type information.
 * Used for auto-registering devices on first visit.
 */

export type DeviceInfo = {
  platform: string;
  os: string;
  browser: string;
  deviceType: string;
  fingerprint: string;
};

export function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent;
  const platform = detectPlatform(ua);
  const os = detectOS(ua);
  const browser = detectBrowser(ua);
  const deviceType = detectDeviceType(ua, platform);
  const fingerprint = hashString(`${ua}|${screen.width}x${screen.height}|${navigator.language}|${platform}`);

  return { platform, os, browser, deviceType, fingerprint };
}

export function defaultDeviceName(info: DeviceInfo): string {
  const user = "My";
  const osLabel = info.os.charAt(0).toUpperCase() + info.os.slice(1);
  const typeLabel = info.deviceType.charAt(0).toUpperCase() + info.deviceType.slice(1);
  return `${user} ${osLabel} ${typeLabel}`;
}

function detectPlatform(ua: string): string {
  if (/windows/i.test(ua)) return "windows";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/macintosh|mac os/i.test(ua)) return "macos";
  if (/linux/i.test(ua)) return "linux";
  return "web";
}

function detectOS(ua: string): string {
  if (/windows nt 10/i.test(ua)) return "windows 10+";
  if (/windows nt 6/i.test(ua)) return "windows 7/8";
  if (/android (\d+)/i.test(ua)) return `android ${RegExp.$1}`;
  if (/iphone os (\d+)_(\d+)/i.test(ua)) return `ios ${RegExp.$1}.${RegExp.$2}`;
  if (/mac os x (\d+)[._](\d+)/i.test(ua)) return `macos ${RegExp.$1}.${RegExp.$2}`;
  if (/linux/i.test(ua)) return "linux";
  return "unknown";
}

function detectBrowser(ua: string): string {
  if (/edg/i.test(ua)) return "edge";
  if (/chrome/i.test(ua)) return "chrome";
  if (/firefox/i.test(ua)) return "firefox";
  if (/safari/i.test(ua)) return "safari";
  return "other";
}

function detectDeviceType(ua: string, platform: string): string {
  if (platform === "android" && !/mobile/i.test(ua)) return "tablet";
  if (platform === "ios" && /ipad/i.test(ua)) return "tablet";
  if (platform === "android" || platform === "ios") return "mobile";
  return "desktop";
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
