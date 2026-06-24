# OpenSend TURN Server Setup

TURN (Traversal Using Relays around NAT) is used when direct peer-to-peer connections fail.

OpenSend does not include or require a TURN server.

Direct STUN connections work in most network configurations.

## When TURN Is Needed

- Symmetric NAT configurations
- Corporate VPNs
- Cellular carrier-grade NAT
- Some educational/institutional networks

## Configuring a TURN Server

Set these environment variables in your Vercel project or `.env.local`:

```env
NEXT_PUBLIC_TURN_URLS=turn:your-turn-server.com:3478
NEXT_PUBLIC_TURN_USERNAME=your-username
NEXT_PUBLIC_TURN_CREDENTIAL=your-credential
```

Multiple TURN URLs can be comma-separated:

```env
NEXT_PUBLIC_TURN_URLS=turn:server1.com:3478,turns:server1.com:5349
```

## Free TURN Servers

OpenSend does not recommend or endorse specific TURN providers.

Options include:

- Self-hosted coturn
- Cloudflare Calls (if available in your region)
- Metered TURN (free tier available)
- Twilio Network Traversal Service (paid)

## Without TURN

OpenSend works without TURN in most home and office networks.

If transfers fail, verify:

1. Both devices are on different browsers
2. Both devices are on the same account
3. No firewall is blocking WebRTC
4. STUN servers are reachable (google.com:19302)

## Diagnostics

Check your connection status at:

https://opensendbysparsh.vercel.app/diagnostics
