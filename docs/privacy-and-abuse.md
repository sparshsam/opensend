# Privacy & Abuse Prevention

## What We Log

Transfer events log:
- Event type (upload, download, delete, etc.)
- Timestamp
- SHA-256 hash of the sender's IP address (not the raw IP)
- SHA-256 hash of the User-Agent string

We never store raw IP addresses, browser fingerprints, or personal identifiers beyond the user's email (from GitHub OAuth).

## Abuse Controls

Schema-level foundations (not fully active in v0.1.2):

- **Rate limits:** Token creation and upload endpoints should be rate-limited
- **Abuse reporting:** `opensend_transfer_events` has a `reported` event type. Future: report button → admin review → `blocked` status
- **Virus scanning:** `virus_scan_status` column with lifecycle: `pending → scanning → clean | infected | error`
- **File blocking:** `blocked_at` and `blocked` status for admin intervention
- **One-time downloads:** `download_limit` column — when 1, the file is deleted after one download

## File Lifecycle

```
Upload → Scanning (stub) → Available → Expired (24h)
                                    → Deleted (manual)
                                    → Blocked (abuse)
```

## Data Retention

- Files: auto-deleted after 24 hours
- Transfer records: retained for 30 days after expiry, then purged via cron
- Events: retained for 90 days
- MCP tokens: retained until revoked or user deletes account

## Contact for Abuse Reports

Email: sparshsam@gmail.com
