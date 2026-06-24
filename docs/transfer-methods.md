# OpenSend Transfer Methods v0.2.5

OpenSend supports three transfer methods. The default and recommended method is **Wi-Fi / Direct**.

## Method Comparison

| Method | Speed | Network Required | Browser Support | Default |
|--------|-------|-----------------|----------------|---------|
| **Wi-Fi / Direct** | Fast | Yes | All modern browsers | ✅ |
| **Bluetooth** | Medium | No | Chrome Android/Windows only | ❌ |
| **Cloud Relay** | Slow | Yes | All browsers | ❌ |

## 1. Wi-Fi / Direct (Primary)

Uses WebRTC to establish a direct peer-to-peer connection between devices.

- STUN servers for NAT traversal (Google public STUN)
- TURN-ready for symmetric NAT (configurable via env vars)
- SHA-256 checksum verification on completed transfers
- Chunked transfer with per-chunk acknowledgement
- 3 retry attempts per chunk

**Best for:** Same-network devices or internet-connected devices.

## 2. Bluetooth (Foundation)

Browser Bluetooth API (Web Bluetooth) for short-range wireless transfers.

**Current limitations:**
- Chrome on Android only
- Chrome on Windows (limited)
- Not supported on iOS Safari
- Not supported on Firefox
- Not supported on Safari macOS

**Future:** Native Android app via Capacitor, Windows app via native APIs.

## 3. Cloud Relay (Fallback)

Uses existing Supabase Storage infrastructure.

- Upload to `opensend-transfers` bucket
- Share link or claim code
- Download from any device
- 50 MB limit
- 24-hour auto-expiry
- Download count tracking

**Best for:** When direct connection fails or user prefers cloud transfer.
