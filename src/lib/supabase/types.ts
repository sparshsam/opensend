// OpenSend v0.2.0 types — device transfer system

export type TransferStatus = "pending" | "waiting" | "uploading" | "scanning" | "transferring" | "available" | "expired" | "blocked" | "deleted";
export type SessionStatus = "waiting" | "pending_accept" | "accepted" | "declined" | "relay" | "transferring" | "completed" | "failed" | "cancelled";
export type ConnectionType = "direct" | "relay" | "unknown";
export type DeviceType = "desktop" | "mobile" | "tablet";
export type Platform = "windows" | "android" | "ios" | "macos" | "linux" | "web";

// ── Device ──────────────────────────────────────────────────────
export interface Device {
  id: string;
  user_id: string;
  name: string;
  platform: Platform;
  browser: string | null;
  os: string | null;
  device_type: DeviceType;
  fingerprint: string | null;
  is_current: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

// ── Transfer Session ────────────────────────────────────────────
export interface TransferSession {
  id: string;
  sender_id: string | null;
  receiver_id: string | null;
  sender_device_id: string | null;
  receiver_device_id: string | null;
  status: SessionStatus;
  connection_type: ConnectionType;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Transfer ────────────────────────────────────────────────────
export interface OpenSendTransfer {
  id: string;
  user_id: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string | null;
  claim_code: string | null;
  share_token_hash: string | null;
  password_hash: string | null;
  virus_scan_status: string;
  download_count: number;
  download_limit: number | null;
  last_downloaded_at: string | null;
  status: TransferStatus;
  expires_at: string;
  sender_ip_hash: string | null;
  sender_ua_hash: string | null;
  reported_at: string | null;
  blocked_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // v0.2.0 additions
  session_id: string | null;
  checksum: string | null;
  sender_device_id: string | null;
  receiver_device_id: string | null;
}

// ── History Entry ───────────────────────────────────────────────
export interface HistoryEntry {
  id: string;
  type: "sent" | "received";
  file_name: string;
  file_size: number;
  mime_type: string;
  peer_device: string;
  peer_user: string | null;
  status: TransferStatus | SessionStatus;
  created_at: string;
}

export function formatTransferStatus(status: TransferStatus): string {
  const labels: Record<TransferStatus, string> = {
    pending: "Pending",
    waiting: "Waiting",
    uploading: "Uploading",
    scanning: "Scanning",
    transferring: "Transferring",
    available: "Available",
    expired: "Expired",
    blocked: "Blocked",
    deleted: "Deleted",
  };
  return labels[status] || status;
}
