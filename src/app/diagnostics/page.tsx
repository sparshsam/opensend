"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useDevice } from "@/components/device-provider";
import { getGuestDevice } from "@/lib/guest-device";
import { Activity, WifiOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BUILD_COMMIT, BUILD_TIME, isNativePlatform, resolveApiUrlForDisplay } from "@/lib/api-fetch";
import { isNativeAuthAvailable, isNativeAuthConfigured } from "@/lib/native-google-auth";
import { getAuthDiag } from "@/lib/auth-diag";

export default function DiagnosticsPage() {
  const { user } = useAuth();
  const { currentDevice, devices } = useDevice();
  const [gd, setGd] = useState<ReturnType<typeof getGuestDevice>>({ name: "—", id: "—", platform: "—", browser: "—", os: "—", deviceType: "—", createdAt: "" });
  const [webRTCStatus, setWebRTCStatus] = useState("checking...");
  const [mainCopied, setMainCopied] = useState(false);
  const [devCopied, setDevCopied] = useState(false);

  // ── Derived device info ──
  const deviceOS = gd.os !== "—" ? gd.os : gd.platform;
  const deviceBrowser = gd.browser;
  const deviceId = gd.id;

  // ── Dev info (always computed) ──
  const devInfo = {
    origin: typeof window !== "undefined" ? window.location.origin : "—",
    protocol: typeof window !== "undefined" ? window.location.protocol : "—",
    nativePlatform: typeof window !== "undefined" ? isNativePlatform() : false,
    hasCapacitor: typeof window !== "undefined" && "Capacitor" in window,
    apiSessionUrl: typeof window !== "undefined" ? resolveApiUrlForDisplay("/api/guest/sessions") : "—",
    nativeAuthAvailable: typeof window !== "undefined" ? isNativeAuthAvailable() : false,
    nativeAuthConfigured: typeof window !== "undefined" ? isNativeAuthConfigured() : false,
    hasSupabaseSession: !!user,
    deepLinkRegistered: typeof window !== "undefined" && "Capacitor" in window && !!((window as any).Capacitor?.isNativePlatform?.() === true),
    deviceId,
    screenSize: typeof screen !== "undefined" ? `${screen.width}×${screen.height}` : "—",
    language: typeof navigator !== "undefined" ? navigator.language : "—",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "—",
    connectionType: typeof navigator !== "undefined" && "connection" in navigator
      ? ((navigator as any).connection?.effectiveType || "unknown") : "unknown",
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : "—",
    buildTime: BUILD_TIME,
    ...getAuthDiag(),
  };

  // ── Track online status ──
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ── WebRTC check ──
  useEffect(() => {
    const hasWebRTC = typeof RTCPeerConnection !== "undefined";
    const hasDataChannel = typeof RTCDataChannel !== "undefined";
    setWebRTCStatus(hasWebRTC && hasDataChannel ? "available" : "not supported");
    setGd(getGuestDevice());
  }, []);

  // ── Copy helpers ──
  const buildMainText = () => [
    "=== OpenSend Diagnostics ===",
    `Device: ${gd.name} (${deviceOS})`,
    `WebRTC: ${webRTCStatus}`,
    `Account: ${user ? `Signed in as ${user.email}` : "Guest"}`,
    `Devices: ${user ? `${devices.length} registered` : "1 local (guest)"}`,
    "============================",
  ].join("\n");

  const buildDevText = () => [
    "=== OpenSend Dev Tools ===",
    `Device ID: ${devInfo.deviceId}`,
    `Origin: ${devInfo.origin}`,
    `Protocol: ${devInfo.protocol}`,
    `Native platform: ${devInfo.nativePlatform}`,
    `Capacitor detected: ${devInfo.hasCapacitor}`,
    `Deep-link listener: ${devInfo.deepLinkRegistered}`,
    `API session URL: ${devInfo.apiSessionUrl}`,
    `Native Google plugin available: ${devInfo.nativeAuthAvailable}`,
    `Native Google plugin configured: ${devInfo.nativeAuthConfigured}`,
    `Supabase session active: ${devInfo.hasSupabaseSession}`,
    `Screen: ${devInfo.screenSize}`,
    `Language: ${devInfo.language}`,
    `Connection: ${devInfo.connectionType}`,
    `Online: ${devInfo.isOnline}`,
    `UA: ${devInfo.userAgent}`,
    `Build: ${devInfo.buildTime}`,
    "============================",
  ].join("\n");

  const copyMain = async () => {
    await navigator.clipboard.writeText(buildMainText());
    setMainCopied(true);
    setTimeout(() => setMainCopied(false), 2500);
  };

  const copyDev = async () => {
    await navigator.clipboard.writeText(buildDevText());
    setDevCopied(true);
    setTimeout(() => setDevCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      <div className="text-center sm:text-left">
        <h1 className="text-display text-text-primary">Diagnostics</h1>
        <p className="mt-1 text-sm text-text-muted">
          Device, network, and account status
        </p>
      </div>

      {/* ════════════ User-facing section ════════════ */}
      <div className="rounded-xl border border-border-default p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Device</span>
        </div>
        <div className="space-y-3">
          <Row label="Name" value={gd.name} />
          <Row label="OS" value={deviceOS} />
          <Row
            label="WebRTC"
            value={webRTCStatus === "available" ? "Available" : "Not supported"}
            highlight={webRTCStatus === "available" ? "text-accent" : "text-error"}
          />
          <Row
            label="Account"
            value={user ? user.email! : "Guest"}
          />
          <Row
            label="Devices"
            value={user ? `${devices.length} registered` : "1 local (guest)"}
          />
        </div>
        <Button variant="secondary" size="sm" className="w-full mt-2" onClick={copyMain}>
          {mainCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {mainCopied ? "Copied" : "Copy diagnostics"}
        </Button>
      </div>

      {/* ════════════ Dev section ════════════ */}
      <div className="rounded-xl border border-amber-500/15 bg-amber-950/5 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400/70">Dev Tools</span>
        </div>
        <div className="space-y-2 font-mono text-[12px]">
          <DevRow label="Device ID" value={devInfo.deviceId} />
          <DevRow label="Origin" value={devInfo.origin} />
          <DevRow label="Protocol" value={devInfo.protocol} />
          <DevRow label="Native platform" value={String(devInfo.nativePlatform)} highlight={devInfo.nativePlatform ? "text-accent" : ""} />
          <DevRow label="Capacitor detected" value={String(devInfo.hasCapacitor)} highlight={devInfo.hasCapacitor ? "text-accent" : ""} />
          <DevRow label="Deep-link listener" value={String(devInfo.deepLinkRegistered)} highlight={devInfo.deepLinkRegistered ? "text-accent" : ""} />
          <DevRow label="API session URL" value={devInfo.apiSessionUrl} mono={false} />
          <DevRow label="Native Google plugin" value={devInfo.nativeAuthAvailable ? "Available" : "Not available"} highlight={devInfo.nativeAuthAvailable ? "text-accent" : "text-error"} />
          <DevRow label="Native Google configured" value={String(devInfo.nativeAuthConfigured)} highlight={devInfo.nativeAuthConfigured ? "text-accent" : "text-amber-400"} />
          <DevRow label="Supabase session active" value={String(devInfo.hasSupabaseSession)} highlight={devInfo.hasSupabaseSession ? "text-accent" : ""} />
          <DevRow label="Sign-in clicked" value={String(devInfo.signInClicked || 0)} />
          <DevRow label="Native attempted" value={String(!!devInfo.nativeAttempted)} />
          <DevRow label="idToken received" value={String(!!devInfo.idTokenReceived)} />
          {devInfo.lastAuthError && <DevRow label="Last auth error" value={devInfo.lastAuthError} highlight="text-error" />}
          <DevRow label="Screen" value={devInfo.screenSize} />
          <DevRow label="Language" value={devInfo.language} />
          <DevRow label="Connection" value={devInfo.connectionType} />
          <DevRow label="Online" value={String(devInfo.isOnline)} highlight={!isOnline ? "text-error" : "text-accent"} />
          <DevRow label="UA" value={devInfo.userAgent} mono={false} />
          <DevRow label="Build" value={devInfo.buildTime} />
        </div>
        <Button variant="secondary" size="sm" className="w-full mt-2 bg-amber-950/20" onClick={copyDev}>
          {devCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {devCopied ? "Copied" : "Copy dev info"}
        </Button>
      </div>
    </div>
  );
}

// ── Shared row components ──

function Row({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-text-muted">{label}</span>
      <span className={`text-sm font-medium text-right max-w-[55%] break-all ${highlight || "text-text-primary"}`}>{value}</span>
    </div>
  );
}

function DevRow({ label, value, highlight, mono = true }: { label: string; value: string; highlight?: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-text-muted/70 shrink-0 whitespace-nowrap">{label}</span>
      <span className={`text-right break-all max-w-[60%] ${highlight || "text-text-primary"} ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
