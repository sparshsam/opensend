"use client";

import { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { useDevice } from "@/components/device-provider";
import { WebRTCEngine, type TransferProgress, type TransferState, type TransferMetadata, computeSHA256, formatSpeed, formatETA } from "@/lib/webrtc/webrtc-engine";
import { SignalingService, DeviceHeartbeat } from "@/lib/webrtc/signaling";
import type { Device } from "@/lib/supabase/types";

type TransferDirection = "send" | "receive" | null;

interface ActiveTransfer {
  id: string;
  direction: TransferDirection;
  fileName: string;
  fileSize: number;
  peerDevice: string;
  state: TransferState;
  progress: TransferProgress;
  sessionId: string;
}

interface TransferContext {
  activeTransfers: ActiveTransfer[];
  onlineDevices: Device[];
  startSend: (file: File, receiverDeviceId: string) => Promise<void>;
  acceptTransfer: (sessionId: string) => Promise<void>;
  declineTransfer: (sessionId: string) => Promise<void>;
  cancelTransfer: (sessionId: string) => Promise<void>;
  incomingRequests: ActiveTransfer[];
  refreshOnlineDevices: () => Promise<void>;
  startHeartbeat: () => void;
}

const TransferCtx = createContext<TransferContext>({
  activeTransfers: [],
  onlineDevices: [],
  startSend: async () => {},
  acceptTransfer: async () => {},
  declineTransfer: async () => {},
  cancelTransfer: async () => {},
  incomingRequests: [],
  refreshOnlineDevices: async () => {},
  startHeartbeat: () => {},
});

export function TransferProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { currentDevice, devices } = useDevice();
  const [activeTransfers, setActiveTransfers] = useState<ActiveTransfer[]>([]);
  const [onlineDevices, setOnlineDevices] = useState<Device[]>([]);
  const engineRef = useRef(new WebRTCEngine());
  const signalRef = useRef(new SignalingService());
  const heartbeatRef = useRef<DeviceHeartbeat | null>(null);

  // Start device heartbeat when signed in with a device
  const startHeartbeat = useCallback(() => {
    if (!currentDevice) return;
    if (!heartbeatRef.current) {
      heartbeatRef.current = new DeviceHeartbeat();
    }
    heartbeatRef.current.start(currentDevice.id);
  }, [currentDevice]);

  useEffect(() => {
    return () => {
      heartbeatRef.current?.stop();
    };
  }, []);

  // Refresh online devices from presence channel
  const refreshOnlineDevices = useCallback(async () => {
    if (!currentDevice) return;
    const { getOnlineDevices } = await import("@/lib/webrtc/signaling");
    const onlineIds = await getOnlineDevices();
    // Filter to our own devices that are online (excluding current)
    const online = devices.filter(
      (d) => onlineIds.includes(d.id) && d.id !== currentDevice.id,
    );
    setOnlineDevices(online);
  }, [devices, currentDevice]);

  // SEND: Start sending a file to a device
  const startSend = useCallback(async (file: File, receiverDeviceId: string) => {
    if (!user || !currentDevice || !receiverDeviceId) return;

    // Create session via API
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiver_id: user.id,
        receiver_device_id: receiverDeviceId,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        checksum: await computeSHA256(new Uint8Array(await file.arrayBuffer())),
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create session");
    }

    const { session, transfer } = await res.json();
    const sessionId = session.id;

    // Find receiver device name
    const receiverDevice = devices.find((d) => d.id === receiverDeviceId);

    // Add to active transfers
    const transferItem: ActiveTransfer = {
      id: transfer.id,
      direction: "send",
      fileName: file.name,
      fileSize: file.size,
      peerDevice: receiverDevice?.name || "Unknown Device",
      state: "negotiating",
      progress: { bytesTransferred: 0, totalBytes: file.size, percent: 0, speedBps: 0, estimatedRemainingMs: null, chunkIndex: 0, totalChunks: 0, currentFileIndex: 0, fileCount: 1, currentFileName: file.name },
      sessionId,
    };
    setActiveTransfers((prev) => [...prev, transferItem]);

    // Setup signaling + WebRTC
    const engine = engineRef.current;
    const signal = signalRef.current;

    engine.onProgress((p) => {
      setActiveTransfers((prev) =>
        prev.map((t) => t.sessionId === sessionId ? { ...t, progress: p } : t),
      );
    });

    engine.onStateChange((s) => {
      setActiveTransfers((prev) =>
        prev.map((t) => t.sessionId === sessionId ? { ...t, state: s } : t),
      );
      if (s === "completed" || s === "cancelled" || s === "error") {
        signal.leave();
        engine.cleanup();
        // Update session status
        fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: s === "completed" ? "completed" : s === "cancelled" ? "cancelled" : "failed",
            connection_type: "direct",
          }),
        });
      }
    });

    signal.join(sessionId, currentDevice.id, async (msg) => {
      await engine.handleSignal(msg);
    });

    // Wait for signaling to be ready, then create connection
    signal._onReady = async () => {
      const dc = await engine.createConnection(sessionId, (msg) => signal.send(msg));
      // Wait for data channel open
      await new Promise<void>((resolve) => {
        const check = () => {
          if (dc.readyState === "open") resolve();
          else setTimeout(check, 100);
        };
        dc.onopen = () => resolve();
        if (dc.readyState === "open") resolve();
      });
      // Send the file
      await engine.sendFile(file);
    };
  }, [user, currentDevice, devices]);

  // RECEIVE: Accept an incoming transfer
  const acceptTransfer = useCallback(async (sessionId: string) => {
    if (!currentDevice) return;

    // Update session status
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    });

    // Fetch session details to get the offer
    const res = await fetch(`/api/sessions/${sessionId}`);
    const session = await res.json();

    const transferItem: ActiveTransfer = {
      id: sessionId,
      direction: "receive",
      fileName: "",
      fileSize: 0,
      peerDevice: session.sender_device?.name || "Unknown Device",
      state: "negotiating",
      progress: { bytesTransferred: 0, totalBytes: 0, percent: 0, speedBps: 0, estimatedRemainingMs: null, chunkIndex: 0, totalChunks: 0, currentFileIndex: 0, fileCount: 1, currentFileName: "" },
      sessionId,
    };
    setActiveTransfers((prev) => [...prev, transferItem]);

    const engine = engineRef.current;
    const signal = signalRef.current;

    engine.onProgress((p) => {
      setActiveTransfers((prev) =>
        prev.map((t) => t.sessionId === sessionId ? { ...t, progress: p } : t),
      );
    });

    engine.onStateChange((s) => {
      setActiveTransfers((prev) =>
        prev.map((t) => t.sessionId === sessionId ? { ...t, state: s } : t),
      );
      if (s === "completed" || s === "cancelled" || s === "error") {
        signal.leave();
        engine.cleanup();
        fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: s === "completed" ? "completed" : s === "cancelled" ? "cancelled" : "failed",
          }),
        });
      }
    });

    engine.onMetadata((m: TransferMetadata) => {
      setActiveTransfers((prev) =>
        prev.map((t) => t.sessionId === sessionId ? {
          ...t, fileName: m.fileName, fileSize: m.fileSize,
          progress: { ...t.progress, totalBytes: m.fileSize },
        } : t),
      );
    });

    // Join signaling channel and listen for offer
    signal.join(sessionId, currentDevice.id, async (msg) => {
      if (msg.type === "offer") {
        const dc = await engine.acceptConnection(sessionId, msg.payload, (m) => signal.send(m));
        // Auto-download happens in the engine when complete
      } else {
        await engine.handleSignal(msg);
      }
    });

  }, [currentDevice]);

  const declineTransfer = useCallback(async (sessionId: string) => {
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "declined" }),
    });
  }, []);

  const cancelTransfer = useCallback(async (sessionId: string) => {
    engineRef.current.cancel();
    signalRef.current.leave();
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    setActiveTransfers((prev) => prev.filter((t) => t.sessionId !== sessionId));
  }, []);

  // Incoming requests = sessions with status "waiting" where we're the receiver
  const incomingRequests = activeTransfers.filter(
    (t) => t.direction === "receive" && t.state === "negotiating",
  );

  return (
    <TransferCtx.Provider value={{
      activeTransfers,
      onlineDevices,
      startSend,
      acceptTransfer,
      declineTransfer,
      cancelTransfer,
      incomingRequests,
      refreshOnlineDevices,
      startHeartbeat,
    }}>
      {children}
    </TransferCtx.Provider>
  );
}

export function useTransfer() {
  return useContext(TransferCtx);
}
