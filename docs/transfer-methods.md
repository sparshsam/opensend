# OpenSend Transfer Methods v0.2.9

OpenSend supports three transfer methods. The default and recommended method is **Direct Transfer**.

## Method Comparison

| Method | Label | Speed | Network Required | Browser Support | Default |
|--------|-------|-------|-----------------|----------------|---------|
| **Direct Transfer** | Direct Transfer | Fast | Yes | All modern browsers | ✅ |
| **Bluetooth** | Bluetooth | Medium | No | Not supported in browsers (coming in native apps) | ❌ |
| **Cloud Transfer** | Cloud Transfer | Slow | Yes | All browsers | ❌ |

## 1. Direct Transfer (Primary)

Uses WebRTC to establish a direct peer-to-peer connection between devices.

- Sender selects one or more files (up to 20) and generates a pair code + QR code
- Receiver scans QR or enters the code
- STUN servers for NAT traversal (Google public STUN)
- TURN-ready for symmetric NAT (configurable via env vars)
- SHA-256 checksum verification on completed transfers (per-file)
- Chunked transfer with per-chunk acknowledgement (3 retry attempts per chunk)
- **Multi-file batch transfer**: up to 20 files, any type/mix, sequential transfer with dual progress bars
- 50 MB per file limit, 20 files max per batch
- Session expires after 15 minutes

**Best for:** Nearby devices or normal browser-to-browser transfer.

## 2. Bluetooth (Future — Disabled)

Browser Bluetooth API (Web Bluetooth) for short-range wireless transfers.

**Current status:** Disabled in all browsers. This is groundwork for future native apps.

**Future:** Native Android app via Capacitor, Windows app via native APIs.

## 3. Cloud Transfer (Fallback)

Temporary upload/download via Supabase Storage. No WebRTC pairing needed.

- Upload to `opensend-transfers` bucket
- Share link with QR code or copy URL
- Receiver downloads directly from the link
- No pairing, no WebRTC required
- 50 MB file limit
- 24-hour auto-expiry
- Download count tracking

**Best for:** When direct connection fails or the user prefers a simple link-based transfer.

## Multi-File Limits

| Limit | Value |
|-------|-------|
| Max files per batch | 20 |
| Max file size | 50 MB per file |
| Transfer type | Sequential (file-by-file) |
| Download mode | Individual files (no ZIP) |
| Browser permission | Multiple downloads may trigger browser blocks; manual download buttons provided as fallback |
