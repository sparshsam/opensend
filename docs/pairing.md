# OpenSend Pairing

OpenSend supports two pairing methods for device-to-device file transfer.

## Method 1: Pair Code (Default)

The sender generates a 6-character code. The receiver enters it.

### Flow

1. Sender clicks **Send**
2. Selects a file
3. Clicks **Generate pair code**
4. A code like `A7K9P2` appears
5. Receiver clicks **Receive** → **Enter pair code**
6. Receiver types the code
7. Session establishes, transfer begins

### Code Format

- 6 characters
- Uppercase letters and numbers (no ambiguous chars: 0/O, 1/I/L)
- Example: `A7K9P2`, `X3M8N5`, `T2R6W4`
- Expires after 15 minutes

## Method 2: QR Code (v1 Ready)

The sender displays a QR code. The receiver scans it.

### Flow

1. Sender clicks **Send**
2. Selects a file → **Generate pair code**
3. QR code displays alongside the pair code
4. Receiver scans with their camera or a QR reader
5. Session establishes automatically

### QR Data Format

```json
{
  "type": "opensend-pair",
  "code": "A7K9P2",
  "session_id": "uuid-here"
}
```

## Method 3: Account-Based Discovery (Future)

Signed-in users with multiple devices can see their other devices listed automatically. This uses:
- Device heartbeat (30s presence)
- Device registry (opensend_devices table)
- Same-account trust

## Session Security

| Attack | Mitigation |
|--------|-----------|
| Code guessing | 6 chars = ~2.5B combinations, 15-min expiry |
| Code interception | Secret confirms session ownership |
| Duplicate join | Session status prevents re-join |
| Expired session | Server rejects expired sessions |

## Technical Details

Guest sessions use `opensend_guest_sessions` table:
- No user_id (no account linkage)
- No device_id (no device registry)
- Self-contained with transfer_code and transfer_secret
- Auto-expired by database function
