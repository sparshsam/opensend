"use client";

import { LogOut, User, KeyRound, Loader2, Plus, Trash2, Copy, Check, Smartphone, Monitor, Edit3, Star, Shield, Globe, Terminal, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/utils";

interface McpToken {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

interface Device {
  id: string;
  name: string;
  platform: string;
  browser: string;
  os: string;
  device_type: string;
  is_current: boolean;
  last_seen_at: string;
  created_at: string;
}

function getDeviceInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function getDeviceIcon(type: string) {
  if (type === "mobile") return Smartphone;
  return Monitor;
}

export default function ProfilePage() {
  const { user, loading, signIn, signOut } = useAuth();
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [mcpEndpoint, setMcpEndpoint] = useState("");
  // Device management
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [renamingDevice, setRenamingDevice] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingDevice, setDeletingDevice] = useState<string | null>(null);
  // Sync toggle
  const [syncEnabled, setSyncEnabled] = useState(true);
  // Connection guide
  const [activeTokensExpanded, setActiveTokensExpanded] = useState(true);
  const [guideExpanded, setGuideExpanded] = useState(true);
  const guideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMcpEndpoint(window.location.origin + "/api/mcp");
  }, []);

  // Auto-scroll to connection guide after token creation
  useEffect(() => {
    if (newToken && guideRef.current) {
      setTimeout(() => {
        guideRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [newToken]);

  // Load devices
  const loadDevices = useCallback(async () => {
    if (!user) return;
    setDevicesLoading(true);
    try {
      const res = await fetch("/api/devices");
      if (res.ok) setDevices(await res.json());
    } catch {} finally {
      setDevicesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadDevices();
  }, [user, loadDevices]);

  const loadTokens = useCallback(async () => {
    if (!user) return;
    setTokensLoading(true);
    try {
      const res = await fetch("/api/mcp/tokens");
      if (res.ok) setTokens(await res.json());
    } catch {} finally {
      setTokensLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadTokens();
  }, [user, loadTokens]);

  const createToken = async () => {
    setCreating(true);
    setNewToken(null);
    try {
      const res = await fetch("/api/mcp/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tokenName || "MCP Access Token" }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewToken(data.token);
        setTokenName("");
        setShowCreateForm(false);
        loadTokens();
      }
    } catch {} finally {
      setCreating(false);
    }
  };

  const revokeToken = async (id: string) => {
    setRevoking(id);
    try {
      const res = await fetch(`/api/mcp/tokens/${id}`, { method: "DELETE" });
      if (res.ok) loadTokens();
    } catch {} finally {
      setRevoking(null);
    }
  };

  const copyToken = async () => {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const copyConfig = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 3000);
  };

  const renameDevice = async (deviceId: string) => {
    if (!renameValue.trim()) return;
    try {
      await fetch("/api/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId, name: renameValue.trim() }),
      });
      setRenamingDevice(null);
      loadDevices();
    } catch {}
  };

  const deleteDevice = async (deviceId: string) => {
    setDeletingDevice(deviceId);
    try {
      await fetch(`/api/devices?id=${deviceId}`, { method: "DELETE" });
      loadDevices();
    } catch {} finally {
      setDeletingDevice(null);
    }
  };

  const activeTokens = tokens.filter(t => !t.revoked_at);
  const displayToken = newToken || (activeTokens.length > 0 ? activeTokens[activeTokens.length - 1].token_prefix + "***" : null);

  const configJson = displayToken && mcpEndpoint ? JSON.stringify({
    mcpServers: {
      opensend: {
        url: mcpEndpoint,
        headers: {
          Authorization: `Bearer ${displayToken}`
        }
      }
    }
  }, null, 2) : null;

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="mx-auto size-6 text-accent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6 py-8 text-center">
        <h1 className="text-display text-text-primary">Profile</h1>
        <div className="space-y-6 py-8">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-bg-surface-muted">
            <User className="size-6 text-text-muted" />
          </div>
          <p className="text-base text-text-secondary max-w-xs mx-auto">
            Sign in to manage your trusted devices, transfer history, and AI agent access.
          </p>
          <div className="space-y-2 max-w-xs mx-auto">
            <div className="border-y border-border-default py-3 text-xs text-text-muted space-y-1.5 text-left">
              <div className="flex justify-between"><span className="font-semibold">Guest mode</span><span className="text-accent">Active</span></div>
              <div className="flex justify-between"><span>History</span><span>Local only</span></div>
              <div className="flex justify-between"><span>Sync</span><span>Not available</span></div>
            </div>
          </div>
          <Button variant="primary" size="lg" onClick={signIn}>
            Sign in with Google
          </Button>
          <p className="text-xs text-text-muted">
            Guest transfers work without signing in. Signing in enables device sync and history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Profile header */}
      <div className="text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/10 mb-4">
          <User className="size-8 text-accent" />
        </div>
        <h1 className="text-display text-text-primary">{user.email?.split("@")[0] || "Profile"}</h1>
      </div>

      {/* Account info */}
      <div className="border-t border-b border-border-default py-4 space-y-3">
        <div className="flex justify-between py-2 items-center">
          <span className="text-label text-text-muted">Email</span>
          <span className="text-sm text-text-primary">{user.email}</span>
        </div>
        <div className="flex justify-between py-2 items-center">
          <span className="text-label text-text-muted">Joined</span>
          <span className="text-sm text-text-muted">
            {new Date(user.created_at).toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric",
            })}
          </span>
        </div>
      </div>

      {/* Trusted Devices */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-text-primary">Trusted Devices</h2>
        <p className="text-sm text-text-muted">
          Devices that have accessed your account
        </p>

        {devicesLoading ? (
          <div className="text-center py-6">
            <Loader2 className="mx-auto size-5 text-accent animate-spin" />
          </div>
        ) : devices.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">
            No devices registered yet. Sign in on another device to see it here.
          </p>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => {
              const Icon = getDeviceIcon(device.device_type);
              const isRenaming = renamingDevice === device.id;
              return (
                <div key={device.id} className="flex items-center justify-between gap-3 rounded-full px-5 py-3.5 bg-bg-surface-muted/30">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="shrink-0 size-10 rounded-full bg-accent/20 flex items-center justify-center">
                      {isRenaming ? (
                        <Icon className="size-5 text-accent" />
                      ) : (
                        <span className="text-sm font-bold text-accent">{getDeviceInitials(device.name)}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {isRenaming ? (
                        <div className="flex gap-2 items-center">
                          <input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="w-full rounded-full px-3 py-1.5 bg-bg-base text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") renameDevice(device.id); if (e.key === "Escape") setRenamingDevice(null); }}
                          />
                          <button onClick={() => renameDevice(device.id)} className="text-accent text-xs font-semibold cursor-pointer">Save</button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-text-primary truncate flex items-center gap-1.5">
                            {device.name}
                            {device.is_current && <span className="text-[10px] font-bold tracking-wider uppercase text-accent">Current</span>}
                          </p>
                          <p className="text-xs text-text-muted">
                            {device.platform} &middot; {device.browser} &middot; Last seen {formatDate(device.last_seen_at)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setRenamingDevice(device.id); setRenameValue(device.name); }}
                      className="text-text-secondary hover:text-text-primary transition p-1.5 cursor-pointer"
                      title="Rename"
                    >
                      <Edit3 className="size-4" />
                    </button>
                    {!device.is_current && (
                      <button
                        onClick={() => deleteDevice(device.id)}
                        disabled={deletingDevice === device.id}
                        className="text-text-secondary hover:text-error transition p-1.5 disabled:opacity-40 cursor-pointer"
                        title="Revoke"
                      >
                        {deletingDevice === device.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sync Settings */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-text-primary">Sync Settings</h2>
        <div className="border-y border-border-default py-3 space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-semibold text-text-primary">Sync transfer history</p>
              <p className="text-xs text-text-muted">Save transfers to your account for access across devices</p>
            </div>
            <button
              onClick={() => setSyncEnabled(!syncEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition cursor-pointer ${syncEnabled ? "bg-accent" : "bg-bg-surface-muted"}`}
              role="switch"
              aria-checked={syncEnabled}
            >
              <span className={`inline-block size-5 rounded-full bg-white transition transform ${syncEnabled ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
            </button>
          </div>
          <div className="flex justify-between py-1.5 text-xs text-text-muted">
            <span>Favorites</span>
            <span className="flex items-center gap-1"><Star className="size-3 text-accent" /> Star transfers to find them quickly</span>
          </div>
        </div>
      </div>

      {/* AI Access — MCP Tokens */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary">AI Access</h2>
            <p className="text-sm text-text-muted mt-1">
              Let AI agents use OpenSend on your behalf
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
            <Plus className="size-4" /> New token
          </Button>
        </div>

        {showCreateForm && (
          <div className="rounded-2xl p-5 bg-bg-surface-muted space-y-3">
            <input
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="e.g. Claude Code"
              maxLength={100}
              className="w-full rounded-full px-5 py-3 bg-bg-base text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <Button variant="primary" size="sm" disabled={creating || !tokenName.trim()} onClick={createToken}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {creating ? "Creating..." : "Generate"}
            </Button>
          </div>
        )}

        {/* New token banner */}
        {newToken && (
          <div className="rounded-2xl p-5 border-2 border-accent/30 bg-accent/5 space-y-3">
            <p className="text-sm font-bold text-accent flex items-center gap-2">
              <KeyRound className="size-4" /> Token created — save it now
            </p>
            <p className="text-xs text-text-muted">This is the only time you will see this token.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-bg-base rounded-full px-4 py-2.5 text-text-primary break-all select-all">
                {newToken}
              </code>
              <Button variant="secondary" size="sm" onClick={copyToken}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* Token list */}
        {tokensLoading ? (
          <div className="text-center py-6">
            <Loader2 className="mx-auto size-5 text-accent animate-spin" />
          </div>
        ) : tokens.length > 0 && (
          <>
            <button
              onClick={() => setActiveTokensExpanded(!activeTokensExpanded)}
              className="flex items-center gap-2 text-sm font-semibold text-text-muted hover:text-text-primary transition cursor-pointer w-full text-left"
            >
              {activeTokensExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              {activeTokens.length} active token{activeTokens.length !== 1 ? "s" : ""}
            </button>
            {activeTokensExpanded && (
              <div className="space-y-2">
                {tokens.map((token) => (
                  <div key={token.id} className="flex items-center justify-between gap-3 rounded-full px-5 py-3 bg-bg-surface-muted/30">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <KeyRound className="size-4 text-text-muted shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">{token.name}</p>
                        <p className="text-xs text-text-muted">
                          {token.revoked_at ? (
                            <span className="text-error">Revoked {formatDate(token.revoked_at)}</span>
                          ) : (
                            <>{token.token_prefix}{token.last_used_at ? " · Last used " + formatDate(token.last_used_at) : " · Never used"}</>
                          )}
                        </p>
                      </div>
                    </div>
                    {!token.revoked_at && (
                      <button onClick={() => revokeToken(token.id)} disabled={revoking === token.id}
                        className="text-text-secondary hover:text-error transition p-1.5 disabled:opacity-40 cursor-pointer" title="Revoke">
                        {revoking === token.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Persistent MCP Connection Guide ── */}
        <div ref={guideRef} className="rounded-2xl border border-border-default overflow-hidden">
          <button
            onClick={() => setGuideExpanded(!guideExpanded)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-bg-surface-muted/30 transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-full bg-accent/10 flex items-center justify-center">
                <Terminal className="size-4 text-accent" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary">Connect Your AI Agent</h3>
                <p className="text-xs text-text-muted">Configure Claude Code, Hermes Agent, or any MCP client</p>
              </div>
            </div>
            {guideExpanded ? <ChevronDown className="size-4 text-text-muted" /> : <ChevronRight className="size-4 text-text-muted" />}
          </button>

          {guideExpanded && (
            <div className="px-5 pb-5 space-y-4">
              {/* Endpoint */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">MCP Endpoint</p>
                <div className="flex items-center gap-2 bg-bg-surface-muted/20 rounded-full px-4 py-2.5">
                  <Globe className="size-4 text-accent shrink-0" />
                  <code className="text-xs font-mono text-text-primary break-all">{mcpEndpoint}</code>
                </div>
              </div>

              {/* Auth */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Authentication</p>
                <div className="flex items-center gap-2 bg-bg-surface-muted/20 rounded-full px-4 py-2.5">
                  <Shield className="size-4 text-accent shrink-0" />
                  <code className="text-xs font-mono text-text-muted break-all">Authorization: Bearer {'<your-token>'}</code>
                </div>
              </div>

              {/* Config template */}
              {configJson && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">MCP Configuration</p>
                    <Button variant="secondary" size="sm" onClick={() => copyConfig(configJson!)}>
                      {copiedConfig ? <Check className="size-3" /> : <Copy className="size-3" />}
                      {copiedConfig ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <pre className="text-xs text-text-primary bg-bg-base rounded-2xl p-4 overflow-x-auto whitespace-pre font-mono leading-relaxed select-all border border-border-default">
{configJson}
                  </pre>
                  <p className="text-xs text-text-muted">
                    {newToken
                      ? "This config uses the token you just created. Save it in your AI agent's config file."
                      : activeTokens.length > 0
                        ? "Add this config to your AI agent. Replace the token with a real one from an active token above."
                        : "Create an access token above, then add this config to your AI agent."}
                  </p>
                </div>
              )}

              {/* No token state */}
              {!configJson && (
                <div className="rounded-2xl bg-bg-surface-muted/20 p-4 text-center space-y-2">
                  <KeyRound className="size-5 text-text-muted mx-auto" />
                  <p className="text-sm text-text-muted">Create an access token above to see your connection config.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MCP endpoint display (inline) */}
        {mcpEndpoint && !guideExpanded && (
          <div className="border-y border-border-default py-3 text-sm space-y-2">
            <div className="flex justify-between py-1.5">
              <span className="text-label text-text-muted">Endpoint</span>
              <code className="text-xs font-mono text-accent">{mcpEndpoint}</code>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-label text-text-muted">Auth</span>
              <code className="text-xs font-mono text-text-muted">Authorization: Bearer &lt;token&gt;</code>
            </div>
          </div>
        )}
      </div>

      {/* Sign out */}
      <div className="space-y-3">
        <Button variant="secondary" className="w-full" onClick={signOut}>
          <LogOut className="size-4" /> Sign out
        </Button>
        <p className="text-xs text-text-muted text-center">
          <Shield className="size-3 inline mr-1" />
          Guest transfers still work when signed out
        </p>
      </div>
    </div>
  );
}
