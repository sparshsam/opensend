"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useDevice } from "@/components/device-provider";
import { getGuestDevice } from "@/lib/guest-device";
import { Activity, WifiOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BUILD_COMMIT, BUILD_TIME, isNativePlatform, resolveApiUrlForDisplay } from "@/lib/api-fetch";

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
    hostname: typeof window !== "undefined" ? window.location.hostname : "—",
    protocol: typeof window !== "undefined" ? window.location.protocol : "—",
    nativePlatform: typeof window !== "undefined" ? isNativePlatform() : false,
    hasCapacitor: typeof window !== "undefined" && "Capacitor" in window,
    apiSessionUrl: typeof window !== "undefined" ? resolveApiUrlForDisplay("/api/guest/sessions") : "—",
    deviceId,
    deviceBrowser,
    screenSize: typeof screen !== "undefined" ? `${screen.width}×${screen.height}` : "—",
    language: typeof navigator !== "undefined" ? navigator.language : "—",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "—",
    connectionType: typeof navigator !== "undefined" && "connection" in navigator
      ? ((navigator as any).connection?.effectiveType || "unknown") : "unknown",
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : "—",
    reducedMotion: typeof window !== "undefined" && "matchMedia" in window
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : "—",
    deviceMemory: typeof navigator !== "undefined" ? (navigator as any).deviceMemory || "—" : "—",
    hardwareConcurrency: typeof navigator !== "undefined" ? navigator.hardwareConcurrency || "—" : "—",
    buildCommit: BUILD_COMMIT,
    buildTime: BUILD_TIME,
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
    `Browser: ${devInfo.deviceBrowser}`,
    `User Agent: ${devInfo.userAgent}`,
    `Screen: ${devInfo.screenSize}`,
    `Language: ${devInfo.language}`,
    `Origin: ${devInfo.origin}`,
    `Hostname: ${devInfo.hostname}`,
    `Protocol: ${devInfo.protocol}`,
    `Native platform: ${devInfo.nativePlatform}`,
    `Capacitor detected: ${devInfo.hasCapacitor}`,
    `API session URL: ${devInfo.apiSessionUrl}`,
    `Connection: ${devInfo.connectionType}`,
    `Online: ${devInfo.isOnline}`,
    `Reduced motion: ${devInfo.reducedMotion}`,
    `Device memory: ${devInfo.deviceMemory}`,
    `CPU cores: ${devInfo.hardwareConcurrency}`,
    `Build: ${devInfo.buildCommit} (${devInfo.buildTime})`,
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
          <DevRow label="Browser" value={devInfo.deviceBrowser} />
          <DevRow label="User Agent" value={devInfo.userAgent} mono={false} />
          <DevRow label="Screen" value={devInfo.screenSize} />
          <DevRow label="Language" value={devInfo.language} />
          <DevRow label="Origin" value={devInfo.origin} />
          <DevRow label="Hostname" value={devInfo.hostname} />
          <DevRow label="Protocol" value={devInfo.protocol} />
          <DevRow label="Native platform" value={String(devInfo.nativePlatform)} />
          <DevRow label="Capacitor" value={String(devInfo.hasCapacitor)} />
          <DevRow label="API session URL" value={devInfo.apiSessionUrl} mono={false} />
          <DevRow label="Connection" value={devInfo.connectionType} />
          <DevRow label="Online" value={String(devInfo.isOnline)} highlight={!isOnline ? "text-error" : "text-accent"} />
          <DevRow label="Reduced motion" value={String(devInfo.reducedMotion)} />
          <DevRow label="Device memory" value={String(devInfo.deviceMemory)} />
          <DevRow label="CPU cores" value={String(devInfo.hardwareConcurrency)} />
          <DevRow label="Build" value={`${devInfo.buildCommit} (${devInfo.buildTime.slice(0, 10)})`} />
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
