# OpenSend Guest Mode v0.2.6

OpenSend works without an account.

Guest mode is the default experience.

## How Guest Mode Works

1. Open OpenSend
2. Click **Send** or **Receive**
3. A temporary identity is generated (e.g., "Blue Falcon")
4. **Direct Transfer**: sender selects a file, creates a session, shows a QR code + 6-character pair code
5. **Direct Transfer**: receiver scans the QR code or enters the pair code
6. Files transfer directly via WebRTC
7. Session expires after 15 minutes

## No Account Required

- No sign up
- No login
- No email
- No cloud storage for direct transfers
- No data collection

## Guest Identity

Each session uses ephemeral device names:

- Blue Falcon
- Quiet River
- Silver Pine
- Red Wolf

These are random, temporary, and not stored on any server.

## Guest Sessions

| Property | Value |
|----------|-------|
| Session lifetime | 15 minutes |
| Transfer code | 6 alphanumeric characters |
| Security | Pair code identifies session; transfer_secret protects sender-only actions |
| Storage | None (direct P2P) or temporary cloud (Cloud Transfer) |
| History | Local only (browser localStorage) |

## Transfer Methods

### Direct Transfer
- Sender generates a pair code and QR code
- Receiver scans QR with their phone camera or enters the pair code
- Session links automatically
- WebRTC establishes direct P2P connection
- File transfers with progress, checksum verification

### Cloud Transfer
- Sender selects a file and uploads temporarily
- A download link + QR is generated
- Receiver opens the link or scans the QR
- File downloads directly from cloud storage
- No WebRTC pairing needed
- Link expires after 24 hours

## Pairing Flow

The receiver joins using just the 6-character pair code (no secret needed):

1. **GET /api/guest/sessions?code=CODE** — look up session
2. **PATCH /api/guest/sessions** with `transfer_code` + `receiver_name` — join as receiver
3. Poll for WebRTC signals or use cloud download link

Sender actions (cancel, update metadata) require the full `transfer_secret` UUID.

## UI Status States

- **Waiting for receiver** — QR/code displayed, polling for connection
- **Receiver joined** — receiver detected, establishing WebRTC
- **Connecting** — ICE negotiation in progress
- **Transferring** — file chunks being sent with progress bar
- **Verifying** — SHA-256 checksum verification
- **Completed** — file received successfully
- **Failed** — connection or transfer error

## Limitations

- Max file size: 50 MB
- Direct Transfer session expires in 15 minutes
- Cloud Transfer link expires in 24 hours
- No transfer resume on failure
- Same-network recommended for best Direct Transfer performance
- Cross-account friend transfers not yet supported

## Sign In (Optional)

Signing in enables:
- Device registry (name your devices)
- Synced device discovery
- MCP agent integration
- Future cloud features

Guest mode never depends on accounts.
