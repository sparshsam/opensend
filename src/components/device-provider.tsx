"use client";

import { createContext, useContext, useEffect, useState, type ReactNode, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { detectDevice, defaultDeviceName, type DeviceInfo } from "@/lib/device-detect";
import type { Device } from "@/lib/supabase/types";

interface DeviceContext {
  currentDevice: Device | null;
  devices: Device[];
  loading: boolean;
  register: (name?: string) => Promise<void>;
  rename: (deviceId: string, name: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const DeviceCtx = createContext<DeviceContext>({
  currentDevice: null,
  devices: [],
  loading: true,
  register: async () => {},
  rename: async () => {},
  refresh: async () => {},
});

export function DeviceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentDevice, setCurrentDevice] = useState<Device | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [registered, setRegistered] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setDevices([]);
      setCurrentDevice(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/devices");
      if (res.ok) {
        const list: Device[] = await res.json();
        setDevices(list);
        setCurrentDevice(list.find((d) => d.is_current) ?? null);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [user]);

  const registerFn = useCallback(async (customName?: string) => {
    if (!user) return;
    setRegistered(true);
    const info: DeviceInfo = detectDevice();
    const name = customName || defaultDeviceName(info);

    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          platform: info.platform,
          browser: info.browser,
          os: info.os,
          device_type: info.deviceType,
          fingerprint: info.fingerprint,
        }),
      });
      if (res.ok) {
        await refresh();
      }
    } catch {
      // Silently fail
    }
  }, [user, refresh]);

  const renameFn = useCallback(async (deviceId: string, name: string) => {
    try {
      await fetch("/api/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId, name }),
      });
      await refresh();
    } catch {
      // Silently fail
    }
  }, [refresh]);

  // Load devices on auth change
  useEffect(() => {
    setLoading(true);
    refresh();
  }, [user, refresh]);

  return (
    <DeviceCtx.Provider value={{
      currentDevice,
      devices,
      loading,
      register: registerFn,
      rename: renameFn,
      refresh,
    }}>
      {children}
    </DeviceCtx.Provider>
  );
}

export function useDevice() {
  return useContext(DeviceCtx);
}
