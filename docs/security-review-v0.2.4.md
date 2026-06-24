# OpenSend Security Review v0.2.4

## Session Creation

| Control | Status | Notes |
|---------|--------|-------|
| Random transfer code | ✅ | 6 chars from 32-char alphabet (~1B combinations) |
| Random transfer secret | ✅ | UUID v4 per session |
| Session auto-expiry | ✅ | 15 minutes via DB trigger |
| No PII in session | ✅ | Ephemeral names only |

## Pair Codes

| Control | Status | Notes |
|---------|--------|-------|
| Cryptographically random | ✅ | Math.random over 32-char alphabet |
| Expire automatically | ✅ | Server checks `expires_at` on every lookup |
| No user data exposed | ✅ | Code only links to ephemeral session |
| Rate limiting | ⏳ | Future: add rate limits on code generation |
| Brute force protection | ⏳ | Future: add attempt limiting |

## QR Joining

| Control | Status | Notes |
|---------|--------|-------|
| Session-bound QR data | ✅ | QR encodes session_id + code |
| No PII in QR | ✅ | Ephemeral data only |
| QR re-use prevented | ✅ | Session status prevents re-joins |
| QR expiry | ✅ | Same 15-min session expiry |

## Signaling Messages

| Control | Status | Notes |
|---------|--------|-------|
| HTTP polling (no WebSocket) | ✅ | No persistent connection to intercept |
| Signal messages stored temporarily | ✅ | `opensend_guest_signals` table |
| Auto-cleanup | ✅ | Signals deletable by age |
| Signal binding to session | ✅ | All signals reference session_id |

## Transfer Authorization

| Control | Status | Notes |
|---------|--------|-------|
| Session secret required | ✅ | All mutations require secret |
| Duplicate join rejected | ✅ | Status check prevents re-join |
| Expired session rejected | ✅ | Server validates expiry |
| Cancelled session rejected | ✅ | Status check prevents use |
| Completed session rejected | ✅ | Status check prevents re-use |
| Transfer checksum verification | ✅ | SHA-256 at end of transfer |

## Found Issues

| Issue | Severity | Status |
|-------|----------|--------|
| No rate limiting on code generation | Low | ⏳ Future |
| No rate limiting on polling | Low | ⏳ Future |
| Math.random (not crypto.getRandomValues) for pair codes | Medium | Fixed in v0.2.4 |
| Session secret sent in URL params | Low | GET params visible in server logs |

## Fixes Applied in v0.2.4

1. Pair codes now use `crypto.getRandomValues()` instead of `Math.random()`
2. Polling signaling uses POST for sending (no data in URL)
3. Guest sessions have enforced status lifecycle
4. All mutations validated against transfer_secret
