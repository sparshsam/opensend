// OpenSend database types matching the prefixed schema

export type TransferStatus = "uploading" | "scanning" | "available" | "expired" | "blocked" | "deleted";
export type VirusScanStatus = "pending" | "scanning" | "clean" | "infected" | "error";
export type EventType =
  | "upload_started" | "upload_completed" | "upload_failed"
  | "scan_started" | "scan_completed" | "scan_failed"
  | "download_started" | "download_completed"
  | "expired" | "deleted" | "blocked" | "reported"
  | "password_attempt" | "password_correct";

export interface OpenSendTransfer {
  id: string;
  user_id: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  claim_code: string;
  share_token_hash: string;
  password_hash: string | null;
  virus_scan_status: VirusScanStatus;
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
}

export interface OpenSendTransferEvent {
  id: string;
  transfer_id: string;
  user_id: string | null;
  event_type: EventType;
  metadata: Record<string, unknown> | null;
  ip_hash: string | null;
  ua_hash: string | null;
  created_at: string;
}

export interface OpenSendMcpToken {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** Returns a display-friendly label for the transfer status. */
export function formatTransferStatus(status: TransferStatus): string {
  const labels: Record<TransferStatus, string> = {
    uploading: "Uploading",
    scanning: "Scanning",
    available: "Available",
    expired: "Expired",
    blocked: "Blocked",
    deleted: "Deleted",
  };
  return labels[status];
}
