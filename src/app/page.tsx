"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Monitor, Smartphone, Send, QrCode, Loader2, ArrowUpFromLine, ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { useDevice } from "@/components/device-provider";
import { useTransfer } from "@/components/transfer-provider";
import { TransferMonitor } from "@/components/transfer-monitor";
import { formatBytes } from "@/lib/utils";

export default function HomePage() {
  const { user, signIn } = useAuth();
  const { currentDevice, devices } = useDevice();
  const { activeTransfers, startSend, cancelTransfer, incomingRequests, acceptTransfer, declineTransfer, onlineDevices, refreshOnlineDevices, startHeartbeat } = useTransfer();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        setError("File too large. Maximum: 50 MB.");
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!selectedFile || !selectedDevice) return;
    setSending(true);
    setError(null);
    try {
      startHeartbeat();
      await startSend(selectedFile, selectedDevice);
      setSelectedFile(null);
      setSelectedDevice(null);
    } catch (err: any) {
      setError(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  }, [selectedFile, selectedDevice, startSend, startHeartbeat]);

  const otherDevices = devices.filter((d) => !d.is_current);

  if (!user) {
    return (
      <div className="space-y-10 text-center py-10">
        <div className="space-y-4">
          <h1 className="text-hero text-text-primary">OpenSend</h1>
          <p className="text-lg text-text-secondary max-w-md mx-auto">
            Send files directly between your devices. No cloud, no uploads, no limits.
          </p>
        </div>
        <div className="border-t border-b border-border-default py-4">
          <div className="flex items-center justify-center gap-6 text-xs text-label text-text-muted">
            <span>Device to device</span>
            <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
            <span>Free &amp; ad-free</span>
            <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
            <span>Open-source</span>
            <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
            <span>Privacy-first</span>
          </div>
        </div>
        <Button variant="primary" size="lg" onClick={signIn}>
          Sign in to start sending
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Incoming requests */}
      {incomingRequests.length > 0 && (
        <div className="space-y-4">
          <p className="text-label text-accent">Incoming transfer</p>
          {incomingRequests.map((req) => (
            <div key={req.sessionId} className="rounded-2xl p-6 bg-bg-surface-muted space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-accent/10">
                  <ArrowDownToLine className="size-6 text-accent" />
                </div>
                <div>
                  <p className="font-bold text-text-primary">{req.peerDevice}</p>
                  <p className="text-sm text-text-muted">Wants to send you a file</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="primary" className="flex-1" onClick={() => acceptTransfer(req.sessionId)}>
                  Accept
                </Button>
                <Button variant="secondary" className="flex-1" onClick={() => declineTransfer(req.sessionId)}>
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active transfers */}
      {activeTransfers.length > 0 && (
        <div className="space-y-4">
          <p className="text-label text-text-muted">Active transfers</p>
          {activeTransfers.map((t) => (
            <TransferMonitor
              key={t.sessionId}
              {...t}
              onCancel={() => cancelTransfer(t.sessionId)}
            />
          ))}
        </div>
      )}

      {/* Send flow */}
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-hero text-text-primary">Send a file</h1>
          <p className="mt-3 text-base sm:text-lg text-text-secondary max-w-lg mx-auto">
            Pick a file, choose a device, send it directly.
          </p>
        </div>

        {/* File picker */}
        <div
          onClick={() => fileRef.current?.click()}
          className="rounded-2xl p-8 sm:p-12 bg-bg-surface-muted cursor-pointer text-center transition hover:bg-bg-surface-muted/80"
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={handleFilePick}
          />
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/10">
            {selectedFile ? (
              <ArrowUpFromLine className="size-6 text-accent" />
            ) : (
              <Upload className="size-6 text-accent" />
            )}
          </div>
          {selectedFile ? (
            <div>
              <p className="text-lg font-bold text-text-primary">{selectedFile.name}</p>
              <p className="text-sm text-text-muted mt-1">{formatBytes(selectedFile.size)}</p>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                className="text-xs text-text-muted hover:text-text-primary mt-2 transition"
              >
                Remove
              </button>
            </div>
          ) : (
            <div>
              <p className="text-xl font-bold text-text-primary">Select a file</p>
              <p className="mt-2 text-sm text-text-muted">
                Click to browse &mdash; up to 50 MB
              </p>
            </div>
          )}
        </div>

        {/* Device picker */}
        {selectedFile && (
          <div className="space-y-4">
            <p className="text-label text-text-muted">Send to device</p>

            {currentDevice && (
              <button
                onClick={() => refreshOnlineDevices()}
                className="text-xs text-text-muted hover:text-text-primary transition"
              >
                Refresh devices
              </button>
            )}

            {otherDevices.length === 0 ? (
              <div className="rounded-2xl p-8 bg-bg-surface-muted text-center">
                <Monitor className="mx-auto size-8 text-text-muted mb-3" />
                <p className="text-base font-bold text-text-primary">No devices found</p>
                <p className="text-sm text-text-muted mt-1 max-w-sm mx-auto">
                  Open OpenSend on another device and sign in with the same account. They&apos;ll appear here automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {otherDevices.map((device) => {
                  const isOnline = onlineDevices.some((d) => d.id === device.id);
                  const isSelected = selectedDevice === device.id;
                  return (
                    <button
                      key={device.id}
                      onClick={() => setSelectedDevice(device.id)}
                      className={`w-full flex items-center gap-4 rounded-full px-5 py-3.5 text-left transition cursor-pointer ${
                        isSelected
                          ? "bg-accent/10 ring-2 ring-accent"
                          : "bg-bg-surface-muted/30 hover:bg-bg-surface-muted"
                      }`}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bg-surface-muted">
                        {device.platform === "android" || device.platform === "ios" ? (
                          <Smartphone className="size-5 text-text-secondary" />
                        ) : (
                          <Monitor className="size-5 text-text-secondary" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">{device.name}</p>
                        <p className="text-xs text-text-muted">
                          {device.platform} &middot; {device.device_type}
                          {isOnline && <span className="text-accent ml-2">Online</span>}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Send button */}
        {selectedFile && selectedDevice && (
          <Button
            variant="primary"
            size="lg"
            className="w-full min-h-[56px] text-base"
            disabled={sending}
            onClick={handleSend}
          >
            {sending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Send className="size-5" />
            )}
            {sending ? "Connecting..." : `Send to ${
              otherDevices.find((d) => d.id === selectedDevice)?.name || "device"
            }`}
          </Button>
        )}

        {error && (
          <p className="text-sm text-error text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
