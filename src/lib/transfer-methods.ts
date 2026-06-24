/**
 * OpenSend v0.2.5 — Transfer Methods
 *
 * Three transfer methods:
 *   1. Wi-Fi / Direct  — WebRTC P2P (primary)
 *   2. Bluetooth        — Browser Web Bluetooth (foundation only)
 *   3. Cloud            — Supabase Storage fallback
 *
 * Each method is a capability-checkable, selectable transfer path.
 * The default is Wi-Fi / Direct.
 */

export type TransferMethod = "direct" | "bluetooth" | "cloud";

export interface TransferMethodInfo {
  id: TransferMethod;
  label: string;
  description: string;
  icon: string;
  supported: boolean;
  supportMessage?: string;
  speed: "fast" | "medium" | "slow";
  requiresNetwork: boolean;
}

export const TRANSFER_METHODS: TransferMethodInfo[] = [
  {
    id: "direct",
    label: "Wi-Fi / Direct",
    description: "Fastest method. Transfers directly between devices over your local network or the internet.",
    icon: "Wifi",
    supported: typeof RTCPeerConnection !== "undefined",
    speed: "fast",
    requiresNetwork: true,
  },
  {
    id: "bluetooth",
    label: "Bluetooth",
    description: "Short-range wireless transfer. Great for nearby devices without internet.",
    icon: "Bluetooth",
    supported: typeof navigator !== "undefined" && "bluetooth" in navigator,
    speed: "medium",
    requiresNetwork: false,
    supportMessage: "Bluetooth transfer is not supported in this browser yet. Try Chrome on Android or Windows.",
  },
  {
    id: "cloud",
    label: "Cloud Relay",
    description: "Fallback method. Files are temporarily uploaded to secure cloud storage and downloaded by the receiver.",
    icon: "Cloud",
    supported: true,
    speed: "slow",
    requiresNetwork: true,
  },
];

export function getMethodInfo(method: TransferMethod): TransferMethodInfo {
  return TRANSFER_METHODS.find((m) => m.id === method) ?? TRANSFER_METHODS[0];
}

export function getDefaultMethod(): TransferMethod {
  if (typeof RTCPeerConnection !== "undefined") return "direct";
  return "cloud";
}
