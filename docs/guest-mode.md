# OpenSend Guest Mode

OpenSend works without an account.

Guest mode is the default experience.

## How Guest Mode Works

1. Open opensendbysparsh.vercel.app
2. Click **Send** or **Receive**
3. A temporary identity is generated (e.g., "Blue Falcon")
4. Sender selects a file and creates a session
5. A 6-character pair code is generated
6. Receiver enters the code (or scans QR)
7. Files transfer directly via WebRTC
8. Session expires after 15 minutes

## No Account Required

- No sign up
- No login
- No email
- No cloud storage
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
| Security | Random secret, no account needed |
| Storage | None (direct P2P) |
| History | Local only (browser localStorage) |

## Pairing Methods

### QR Code (coming fully in a future release)
- Sender shows QR code
- Receiver scans with their phone camera
- Session links automatically

### Pair Code
- Sender shares a 6-character code
- Receiver enters it manually
- Session links immediately

## Limitations

- Max file size: 50 MB
- Session expires in 15 minutes
- No transfer resume on failure
- Same-network recommended for best performance
- Cross-account friend transfers not yet supported

## Sign In (Optional)

Signing in enables:
- Device registry (name your devices)
- Synced device discovery
- MCP agent integration
- Future cloud features

Guest mode never depends on accounts.
