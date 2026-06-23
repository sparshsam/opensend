// Database types for OpenSend MCP server
// Matches the prefixed opensend_ schema

export interface Database {
  public: {
    Tables: {
      opensend_transfers: {
        Row: TransferRow;
        Insert: TransferInsert;
        Update: TransferUpdate;
      };
      opensend_mcp_tokens: {
        Row: McpTokenRow;
      };
    };
  };
}

export interface TransferRow {
  id: string;
  user_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  claim_code: string;
  share_token_hash: string;
  password_hash: string | null;
  virus_scan_status: string;
  download_count: number;
  download_limit: number | null;
  last_downloaded_at: string | null;
  status: string;
  expires_at: string;
  sender_ip_hash: string | null;
  sender_ua_hash: string | null;
  reported_at: string | null;
  blocked_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransferInsert {
  user_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  claim_code: string;
  share_token_hash: string;
  password_hash?: string | null;
  virus_scan_status?: string;
  download_count?: number;
  download_limit?: number | null;
  status?: string;
  expires_at: string;
}

export interface TransferUpdate {
  file_name?: string;
  download_count?: number;
  status?: string;
  deleted_at?: string | null;
}

export interface McpTokenRow {
  id: string;
  user_id: string;
  revoked_at: string | null;
}
