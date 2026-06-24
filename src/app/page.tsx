"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { Upload, Download, QrCode, Send, Monitor, Smartphone, Loader2, ArrowUpFromLine, ArrowDownToLine, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { useDevice } from "@/components/device-provider";
import { useTransfer } from "@/components/transfer-provider";
import { TransferMonitor } from "@/components/transfer-monitor";
import { getGuestDevice } from "@/lib/guest-device";
import { formatBytes } from "@/lib/utils";

export default function HomePage() {
  const { user, signIn } = useAuth();
  const { currentDevice, devices } = useDevice();
  const { activeTransfers, startSend, cancelTransfer, incomingRequests, acceptTransfer, declineTransfer, onlineDevices, refreshOnlineDevices, startHeartbeat } = useTransfer();

  const [guestDevice] = useState(getGuestDevice);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"send" | "receive" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        setError("File too large. Max: 50 MB.");
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
      // In guest mode, use guest device ID
      const targetDevice = devices.find((d) => d.id === selectedDevice);
      if (!targetDevice) {
        setError("Device not found. Refresh the device list.");
        setSending(false);
        return;
      }
      await startSend(selectedFile, selectedDevice);
      setSelectedFile(null);
      setSelectedDevice(null);
      setMode(null);
    } catch (err: any) {
      setError(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  }, [selectedFile, selectedDevice, startSend, startHeartbeat, devices]);

  const otherDevices = devices.filter((d) => !d.is_current);

  // Landing mode — no mode selected
  if (!mode) {
    return (
      <div className="space-y-10 py-10">
        <div className="text-center space-y-4">
          <h1 className="text-hero text-text-primary">OpenSend</h1>
          <p className="text-lg text-text-secondary max-w-md mx-auto">
            Send files directly between your devices. No cloud, no account needed.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 max-w-md mx-auto">
          <button
            onClick={() => setMode("send")}
            className="rounded-2xl p-8 bg-bg-surface-muted text-center hover:bg-bg-surface-muted/80 transition cursor-pointer space-y-3"
          >
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/10">
              <ArrowUpFromLine className="size-8 text-accent" />
            </div>
            <p className="text-xl font-bold text-text-primary">Send</p>
            <p className="text-sm text-text-muted">Choose a file and send it to a nearby device</p>
          </button>

          <button
            onClick={() => setMode("receive")}
            className="rounded-2xl p-8 bg-bg-surface-muted text-center hover:bg-bg-surface-muted/80 transition cursor-pointer space-y-3"
          >
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/10">
              <ArrowDownToLine className="size-8 text-accent" />
            </div>
            <p className="text-xl font-bold text-text-primary">Receive</p>
            <p className="text-sm text-text-muted">Wait for an incoming transfer from another device</p>
          </button>
        </div>

        {/* Active transfers */}
        {activeTransfers.length > 0 && (
          <div className="space-y-3">
            <p className="text-label text-text-muted text-center">Active transfers</p>
            {activeTransfers.map((t) => (
              <TransferMonitor
                key={t.sessionId}
                {...t}
                onCancel={() => cancelTransfer(t.sessionId)}
                compact
              />
            ))}
          </div>
        )}

        {/* Incoming requests */}
        {incomingRequests.length > 0 && (
          <div className="space-y-3">
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

        {/* Info bar */}
        <div className="border-t border-b border-border-default py-4">
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-label text-text-muted">
            <span>No account needed</span>
            <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
            <span>Device to device</span>
            <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
            <span>Free &amp; ad-free</span>
            <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
            <span>Open-source</span>
          </div>
        </div>

        {/* Optional sign in */}
        {!user && (
          <div className="text-center">
            <button
              onClick={signIn}
              className="text-sm text-text-muted hover:text-text-primary transition"
            >
              <User className="size-4 inline mr-1" />
              Sign in for trusted devices &amp; sync
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── SEND MODE ──
  if (mode === "send") {
    return (
      <div className="space-y-6">
        <button
          onClick={() => { setMode(null); setSelectedFile(null); setSelectedDevice(null); }}
          className="text-sm text-text-muted hover:text-text-primary transition"
        >
          &larr; Back
        </button>

        <div className="text-center">
          <h1 className="text-display text-text-primary">Send a file</h1>
          <p className="mt-2 text-sm text-text-muted">
            Device: {guestDevice.name}
          </p>
        </div>

        {/* File picker */}
        <div
          onClick={() => fileRef.current?.click()}
          className="rounded-2xl p-8 sm:p-12 bg-bg-surface-muted cursor-pointer text-center transition hover:bg-bg-surface-muted/80"
        >
          <input ref={fileRef} type="file" className="hidden" onChange={handleFilePick} />
          {selectedFile ? (
            <div>
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/10">
                <ArrowUpFromLine className="size-6 text-accent" />
              </div>
              <p className="text-lg font-bold text-text-primary">{selectedFile.name}</p>
              <p className="text-sm text-text-muted mt-1">{formatBytes(selectedFile.size)}</p>
              <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="text-xs text-text-muted hover:text-text-primary mt-2 transition">
                Remove
              </button>
            </div>
          ) : (
            <div>
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/10">
                <Upload className="size-6 text-accent" />
              </div>
              <p className="text-xl font-bold text-text-primary">Select a file</p>
              <p className="mt-2 text-sm text-text-muted">Click to browse &mdash; up to 50 MB</p>
            </div>
          )}
        </div>

        {/* Device picker */}
        {selectedFile && (
          <div className="space-y-4">
            <p className="text-label text-text-muted">Send to device</p>
            {user && <button onClick={refreshOnlineDevices} className="text-xs text-text-muted hover:text-text-primary transition">Refresh</button>}

            {otherDevices.length === 0 ? (
              <div className="rounded-2xl p-8 bg-bg-surface-muted text-center">
                <Monitor className="mx-auto size-8 text-text-muted mb-3" />
                <p className="text-base font-bold text-text-primary">No devices found</p>
                <p className="text-sm text-text-muted mt-1">
                  Open OpenSend on another device and sign in to the same account.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {otherDevices.map((device) => (
                  <button
                    key={device.id}
                    onClick={() => setSelectedDevice(device.id)}
                    className={`w-full flex items-center gap-4 rounded-full px-5 py-3.5 text-left transition cursor-pointer ${
                      selectedDevice === device.id
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
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedFile && selectedDevice && (
          <Button
            variant="primary"
            size="lg"
            className="w-full min-h-[56px] text-base"
            disabled={sending}
            onClick={handleSend}
          >
            {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
            {sending ? "Connecting..." : `Send to ${otherDevices.find((d) => d.id === selectedDevice)?.name || "device"}`}
          </Button>
        )}

        {error && <p className="text-sm text-error text-center">{error}</p>}
      </div>
    );
  }

  // ── RECEIVE MODE ──
  return (
    <div className="space-y-8 py-10 text-center">
      <button
        onClick={() => setMode(null)}
        className="text-sm text-text-muted hover:text-text-primary transition"
      >
        &larr; Back
      </button>

      <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-accent/10">
        <ArrowDownToLine className="size-12 text-accent" />
      </div>

      <h1 className="text-display text-text-primary">Waiting for transfer</h1>
      <p className="text-sm text-text-muted max-w-sm mx-auto">
        Ask the sender to select your device. When they send a file, you&apos;ll see the request here.
      </p>

      <div className="border-t border-b border-border-default py-4 max-w-xs mx-auto">
        <div className="flex items-center justify-center gap-4 text-xs text-label text-text-muted">
          <span>Device: {guestDevice.name}</span>
        </div>
      </div>

      {incomingRequests.length > 0 && (
        <div className="space-y-3 max-w-sm mx-auto">
          <p className="text-label text-accent">Incoming transfer</p>
          {incomingRequests.map((req) => (
            <div key={req.sessionId} className="rounded-2xl p-6 bg-bg-surface-muted space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-accent/10">
                  <ArrowDownToLine className="size-6 text-accent" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-text-primary">{req.peerDevice}</p>
                  <p className="text-sm text-text-muted">Wants to send you a file</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="primary" className="flex-1" onClick={() => acceptTransfer(req.sessionId)}>Accept</Button>
                <Button variant="secondary" className="flex-1" onClick={() => declineTransfer(req.sessionId)}>Decline</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTransfers.length > 0 && (
        <div className="space-y-3 max-w-sm mx-auto">
          {activeTransfers.map((t) => (
            <TransferMonitor key={t.sessionId} {...t} onCancel={() => cancelTransfer(t.sessionId)} />
          ))}
        </div>
      )}
    </div>
  );
}
