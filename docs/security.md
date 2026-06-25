# OpenSend Security Documentation

## Overview

OpenSend is designed with security as a foundational principle. This document covers the security architecture, threat model, and operational practices.

## Security Architecture

### Transport Layer

| Layer | Protection | Details |
|-------|-----------|---------|
| **Web (TLS)** | HTTPS | All traffic encrypted via TLS Certificate (Let's Encrypt via Vercel) |
| **WebRTC (DTLS)** | Mandatory | All peer-to-peer data channels encrypted via DTLS-SRTP (RFC 5764) |
| **WebRTC (E2EE)** | Optional | App-level AES-256-GCM encryption via Web Crypto API. Key derived from transfer secret using PBKDF2 (600K iterations) |
| **STUN/TURN** | Opportunistic | STUN from Google's public servers. TURN configured with username/password auth |

### Authentication

| Feature | Implementation |
|---------|---------------|
| **Guest sessions** | No auth required. Session identified by random 6-char pair code + UUID transfer secret |
| **User accounts** | Google OAuth via Supabase. Optional, used only for persistent transfers and MCP access |
| **MCP tokens** | SHA-256 hashed tokens stored in DB. Tokens can be revoked individually |
| **Rate limiting** | 5 guest session creations per IP per minute. 10 consecutive poll failures triggers session stop |

### Data Protection

| Data | Storage | Retention |
|------|---------|-----------|
| **Guest signals** | `opensend_guest_signals` table | Deleted after 1 hour via cron cleanup |
| **Guest sessions** | `opensend_guest_sessions` table | Auto-expired after 15 minutes |
| **Cloud transfers** | Supabase Storage + `opensend_transfers` table | Expired after configurable TTL, cleaned by cron |
| **MCP tokens** | `opensend_mcp_tokens` table (hashed) | Kept until revoked |
| **User profiles** | Supabase Auth (Google OIDC) | Per Google's data policy |
| **Transfer files (cloud)** | Supabase Storage (`transfers` bucket) | Deleted when transfer expires |

### Content Security Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co https://*.vercel.app;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https://*.supabase.co;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vercel.app https://send.kovina.org https://*.stun.l.google.com:*;
frame-src 'self';
object-src 'none';
```

### Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Forces HTTPS |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer leakage |
| `Permissions-Policy` | `camera=(self), clipboard-write=(self)` | Restricts API access |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolates cross-origin windows |

## Threat Model

### In Scope

- Guest-to-guest file transfer security
- WebRTC signaling integrity
- Cloud transfer storage and access control
- MCP API authentication and authorization
- User data isolation between signed-in users

### Out of Scope

- Physical device security
- Browser/OS-level compromises
- Network-level man-in-the-middle (mitigated by TLS)
- Side-channel attacks on timing

### Attack Vectors and Mitigations

| Attack | Mitigation |
|--------|-----------|
| **Pair code guessing** | 6-char alphanumeric (32^6 = 1.07B combinations). Rate-limited to 5/min |
| **Signal interception** | Encrypted via TLS. Session-bound (valid secret required) |
| **Replay attack** | Session secret required for all state changes. Events time-bounded |
| **Unauthorized MCP access** | SHA-256 hashed tokens. Revocable. Auth required for all tool calls |
| **Cloud storage scraping** | Random UUID filenames. Download requires valid transfer code |
| **CSRF** | Same-origin policy. No cookies used for guest flows |
| **XSS** | CSP restricts script sources. User input sanitized |
| **Session hijacking** | Transfer secret (UUID) never exposed in UI. Only 6-char code shown |

## Audit Checklist

### Pre-Release

- [ ] All API routes validate input (string length, pattern, UUID format)
- [ ] Rate limiting active on session creation (5/min per IP)
- [ ] CSP header applied
- [ ] All security headers present
- [ ] Supabase RLS policies reviewed
- [ ] Service role key not exposed client-side
- [ ] Guest sessions expire within 15 minutes
- [ ] Cloud transfers have TTL with cleanup
- [ ] MCP tokens hashed with SHA-256
- [ ] No secrets in environment logged
- [ ] File size limits enforced client + server (50 MB per file, 500 MB total)
- [ ] File count limited to 20 per session

### Periodic

- [ ] Review RLS policies for correctness
- [ ] Check cron cleanup is running
- [ ] Review Supabase audit logs for unusual activity
- [ ] Verify CSP hasn't broken after dependency updates
- [ ] Check for new CVEs in dependencies (`npm audit`)
- [ ] Rotate Supabase service role key if exposed

## Penetration Testing Checklist

### Web

- [ ] SQL injection on all API routes (guest/sessions, guest/signal, guest/upload, mcp)
- [ ] NoSQL injection if applicable
- [ ] Path traversal on file uploads
- [ ] Cross-site scripting (XSS) on rendered user input
- [ ] CSRF on state-changing endpoints
- [ ] Rate limit bypass attempts
- [ ] Session ID prediction (pair code randomness)
- [ ] JWT/Token tampering
- [ ] IDOR (accessing other users' sessions/files)
- [ ] Mass assignment on PATCH endpoints

### WebRTC

- [ ] STUN/TURN server abuse
- [ ] Data channel message injection
- [ ] Checksum bypass
- [ ] File type spoofing

### MCP

- [ ] Token brute force
- [ ] User data isolation bypass (querying other user's data)
- [ ] Tool parameter injection
- [ ] DoS via large response sizes

### Infrastructure

- [ ] Subdomain takeover
- [ ] DNS configuration review
- [ ] TLS certificate validity
- [ ] Email/notification abuse
