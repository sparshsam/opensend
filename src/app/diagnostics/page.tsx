"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import { useDevice } from "@/components/device-provider";
import { getGuestDevice } from "@/lib/guest-device";
import { Monitor, Smartphone, Wifi, WifiOff, Activity, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BUILD_COMMIT, BUILD_TIME } from "@/lib/api-fetch";

export default function DiagnosticsPage() {
  const { user } = useAuth();
  const { currentDevice, devices } = useDevice();
  const [gd, setGd] = useState<ReturnType<typeof getGuestDevice>>({ name: "—", id: "—", platform: "—", browser: "—", os: "—", deviceType: "—", createdAt: "" });
  const [webRTCStatus, setWebRTCStatus] = useState("checking...");
  const [iceState, setIceState] = useState("—");
  const [copied, setCopied] = useState(false);

  const copyDiagnostics = async () => {
    const browserDiag = {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "—",
      platform: typeof navigator !== "undefined" ? navigator.platform : "—",
      screenSize: typeof screen !== "undefined" ? `${screen.width}×${screen.height}` : "—",
      connectionType: typeof navigator !== "undefined" && "connection" in navigator
        ? ((navigator as any).connection?.effectiveType || "unknown")
        : "unknown",
      webRTCSupported: typeof RTCPeerConnection !== "undefined" ? "yes" : "no",
    };
    const text = [
      "=== OpenSend Diagnostics ===",
      "--- Device ---",
      `Name: ${gd.name}`,
      `ID: ${gd.id}`,
      `Platform: ${gd.platform}`,
      `Browser: ${gd.browser}`,
      `OS: ${gd.os}`,
      "--- Connection ---",
      `WebRTC: ${webRTCStatus}`,
      `STUN: stun.l.google.com:19302`,
      `TURN: Not configured`,
      `Crypto (SHA-256): Available`,
      `DataChannel: Supported`,
      "--- Account ---",
      `Mode: ${user ? "Signed in" : "Guest"}`,
      ...(user ? [`User: ${user.email}`] : []),
      `Devices: ${user ? `${devices.length} registered` : "1 local (guest)"}`,
      "--- Browser ---",
      `UA: ${browserDiag.userAgent}`,
      `Platform: ${browserDiag.platform}`,
      `Screen: ${browserDiag.screenSize}`,
      `Connection: ${browserDiag.connectionType}`,
      `WebRTC: ${browserDiag.webRTCSupported}`,
      "============================",
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  useEffect(() => {
    // Check WebRTC support
    const hasWebRTC = typeof RTCPeerConnection !== "undefined";
    const hasDataChannel = typeof RTCDataChannel !== "undefined";
    const hasCrypto = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
    setWebRTCStatus(
      hasWebRTC && hasDataChannel ? "available" : "not supported"
    );
    // Load guest device info on client only
    setGd(getGuestDevice());
  }, []);

  return (
    <div className="space-y-8">
      <div className="text-center sm:text-left">
        <h1 className="text-display text-text-primary">Diagnostics</h1>
        <p className="mt-2 text-sm text-text-muted">
          Device, network, and WebRTC status
        </p>
      </div>

      {/* Device info */}
      <div className="border-t border-b border-border-default py-6 space-y-4">
        <p className="text-label text-text-muted">Device</p>
        <div className="space-y-3">
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">Name</span>
            <span className="text-sm text-text-primary">{gd.name}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">ID</span>
            <span className="text-sm font-mono text-text-muted break-all max-w-[60%] text-right">{gd.id}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">Platform</span>
            <span className="text-sm text-text-primary">{gd.platform}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">Browser</span>
            <span className="text-sm text-text-primary">{gd.browser}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">OS</span>
            <span className="text-sm text-text-primary">{gd.os}</span>
          </div>
        </div>
      </div>

      {/* Connection status */}
      <div className="border-t border-b border-border-default py-6 space-y-4">
        <p className="text-label text-text-muted">Connection</p>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2">
            <span className="text-label text-text-muted">WebRTC</span>
            <span className={`text-sm font-bold ${webRTCStatus === "available" ? "text-accent" : "text-error"}`}>
              {webRTCStatus === "available" ? (
                <span className="flex items-center gap-2"><Activity className="size-4" /> Available</span>
              ) : (
                <span className="flex items-center gap-2"><WifiOff className="size-4" /> {webRTCStatus}</span>
              )}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">STUN</span>
            <span className="text-sm text-text-muted">stun.l.google.com:19302</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">TURN</span>
            <span className="text-sm text-text-muted">Not configured</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">Crypto (SHA-256)</span>
            <span className="text-sm font-bold text-accent">Available</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">DataChannel</span>
            <span className="text-sm font-bold text-accent">Supported</span>
          </div>
        </div>
      </div>

      {/* Auth status */}
      <div className="border-t border-b border-border-default py-6 space-y-4">
        <p className="text-label text-text-muted">Account</p>
        <div className="space-y-3">
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">Mode</span>
            <span className="text-sm text-text-primary">{user ? "Signed in" : "Guest"}</span>
          </div>
          {user && (
            <div className="flex justify-between py-2">
              <span className="text-label text-text-muted">User</span>
              <span className="text-sm text-text-primary">{user.email}</span>
            </div>
          )}
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">Devices</span>
            <span className="text-sm text-text-primary">
              {user ? `${devices.length} registered` : "1 local (guest)"}
            </span>
          </div>
        </div>
      </div>

      {/* Browser info */}
      <div className="border-t border-b border-border-default py-6 space-y-4">
        <p className="text-label text-text-muted">Browser</p>
        <div className="space-y-3">
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">User Agent</span>
            <span className="text-xs font-mono text-text-muted break-all max-w-[60%] text-right">
              {typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : "—"}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">Screen</span>
            <span className="text-sm text-text-muted">
              {typeof screen !== "undefined" ? `${screen.width}×${screen.height}` : "—"}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-label text-text-muted">Language</span>
            <span className="text-sm text-text-muted">{navigator.language || "—"}</span>
          </div>
        </div>
      </div>

      {/* Copy diagnostics */}
      <Button variant="secondary" className="w-full" onClick={copyDiagnostics}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy diagnostics"}
      </Button>

      {/* Build info */}
      <div className="text-center text-[10px] text-text-muted/50 pt-2 pb-0">
        APK build {BUILD_COMMIT} · {BUILD_TIME.slice(0, 10)}
      </div>
    </div>
  );
}
