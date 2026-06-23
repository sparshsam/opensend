export interface Transfer {
  id: string;
  user_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  share_code: string | null;
  claim_code: string | null;
  expires_at: string | null;
  download_count: number;
  max_downloads: number | null;
  created_at: string;
  deleted_at: string | null;
}

export interface TransferWithStatus extends Transfer {
  status: "active" | "expired" | "deleted";
  time_remaining?: string;
}
