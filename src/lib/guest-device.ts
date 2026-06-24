/**
 * OpenSend v0.2.2 — Guest Device System
 *
 * Local-first device identity and preferences.
 * No account required. Everything stored in localStorage.
 * Signed-in users get additional cloud-backed device registry.
 */

import { detectDevice, defaultDeviceName, type DeviceInfo } from "./device-detect";

const GUEST_ID_KEY = "opensend_guest_id";
const GUEST_NAME_KEY = "opensend_guest_name";
const GUEST_INFO_KEY = "opensend_guest_info";
const PREF_FOLDER_KEY = "opensend_pref_folder";
const ONBOARDED_KEY = "opensend_onboarded";

export interface GuestDevice {
  id: string;
  name: string;
  platform: string;
  browser: string;
  os: string;
  deviceType: string;
  createdAt: string;
}

export interface GuestPreferences {
  downloadFolder: string;
  autoAccept: boolean;
  maxTransferSize: number;
}

/** Generate or retrieve the local guest device identity */
export function getGuestDevice(): GuestDevice {
  let id: string | null = null;
  let name: string | null = null;
  let infoRaw: string | null = null;

  try {
    id = localStorage.getItem(GUEST_ID_KEY);
    name = localStorage.getItem(GUEST_NAME_KEY);
    infoRaw = localStorage.getItem(GUEST_INFO_KEY);
  } catch {
    // SSR / build environment — no localStorage
    return { id: "ssr", name: "OpenSend", platform: "web", browser: "—", os: "—", deviceType: "desktop", createdAt: new Date().toISOString() };
  }

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(GUEST_ID_KEY, id);
  }

  if (!infoRaw) {
    const info: DeviceInfo = detectDevice();
    infoRaw = JSON.stringify(info);
    localStorage.setItem(GUEST_INFO_KEY, infoRaw);
  }

  const info: DeviceInfo = JSON.parse(infoRaw);

  if (!name) {
    name = defaultDeviceName(info);
    localStorage.setItem(GUEST_NAME_KEY, name);
  }

  return {
    id,
    name,
    platform: info.platform,
    browser: info.browser,
    os: info.os,
    deviceType: info.deviceType,
    createdAt: localStorage.getItem(`${GUEST_ID_KEY}_created`) || new Date().toISOString(),
  };
}

/** Update the guest device name */
export function setGuestDeviceName(name: string) {
  localStorage.setItem(GUEST_NAME_KEY, name);
}

/** Get guest preferences with defaults */
export function getGuestPreferences(): GuestPreferences {
  const folder = localStorage.getItem(PREF_FOLDER_KEY);
  return {
    downloadFolder: folder || "Downloads/OpenSend",
    autoAccept: false,
    maxTransferSize: 52428800, // 50 MB
  };
}

/** Set guest preferences */
export function setGuestPreference(key: keyof GuestPreferences, value: any) {
  if (key === "downloadFolder") {
    localStorage.setItem(PREF_FOLDER_KEY, value);
  }
}

/** Check if onboarding has been completed */
export function isOnboarded(): boolean {
  return localStorage.getItem(ONBOARDED_KEY) === "true";
}

/** Mark onboarding as complete */
export function setOnboarded() {
  localStorage.setItem(ONBOARDED_KEY, "true");
}

/** Reset all local device data */
export function resetGuestDevice() {
  localStorage.removeItem(GUEST_ID_KEY);
  localStorage.removeItem(GUEST_NAME_KEY);
  localStorage.removeItem(GUEST_INFO_KEY);
  localStorage.removeItem(ONBOARDED_KEY);
}
