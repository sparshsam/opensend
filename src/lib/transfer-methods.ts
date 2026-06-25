/**
 * OpenSend v0.2.6 — Transfer Methods
 *
 * Three transfer methods:
 *   1. Direct Transfer — peer-to-peer (primary, QR/code pairing)
 *   2. Bluetooth        — Web Bluetooth (disabled, coming later for native apps)
 *   3. Cloud Transfer   — temporary cloud upload/download
 *
 * Each method is a capability-checkable, selectable transfer path.
 * The default is Direct Transfer.
 */

export type TransferMethod = "direct" | "bluetooth" | "cloud";

export interface TransferMethodInfo {
  id: TransferMethod;
  label: string;
  description: string;
  helperText: string;
  icon: string;
  supported: boolean;
  supportMessage?: string;
  speed: "fast" | "medium" | "slow";
  requiresNetwork: boolean;
}

export const TRANSFER_METHODS: TransferMethodInfo[] = [
  {
    id: "direct",
    label: "Direct Transfer",
    description: "Fastest method. Transfers directly between devices over your local network or the internet.",
    helperText: "Best for nearby devices or a direct connection.",
    icon: "Wifi",
    supported: typeof RTCPeerConnection !== "undefined",
    speed: "fast",
    requiresNetwork: true,
  },
  {
    id: "bluetooth",
    label: "Bluetooth",
    description: "Short-range wireless transfer. Great for nearby devices without internet.",
    helperText: "Coming later for native apps.",
    icon: "Bluetooth",
    supported: false, // Always disabled until truly supported
    speed: "medium",
    requiresNetwork: false,
    supportMessage: "Bluetooth transfer is coming later for native apps and is not supported in browsers yet.",
  },
  {
    id: "cloud",
    label: "Cloud Transfer",
    description: "Uploads temporarily to cloud storage, then receiver downloads directly.",
    helperText: "Uploads temporarily, then receiver downloads.",
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
