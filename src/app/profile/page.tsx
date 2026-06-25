"use client";

import { LogOut, User, KeyRound, Loader2, Plus, Trash2, Copy, Check, Terminal, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { useCallback, useEffect, useState } from "react";
import { formatDate } from "@/lib/utils";

interface McpToken {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export default function ProfilePage() {
  const { user, loading, signIn, signOut } = useAuth();
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Display name (localStorage — no DB needed for guest-first)
  const [displayName, setDisplayName] = useState("");
  const [editingName, setEditingName] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setDisplayName(localStorage.getItem("opensend_display_name") || "");
    }
  }, [user]);

  const saveDisplayName = () => {
    localStorage.setItem("opensend_display_name", displayName);
    setEditingName(false);
  };

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

  const mcpEndpoint = "https://opensendbysparsh.vercel.app/api/mcp";

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
            Sign in to manage your profile and AI agent access.
          </p>
          <Button variant="primary" size="lg" onClick={signIn}>
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="text-center">
        <h1 className="text-display text-text-primary">Profile</h1>
      </div>

      {/* ── ACCOUNT INFO ── */}
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

      {/* ── MCP ACCESS TOKENS ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary">MCP Access Tokens</h2>
            <p className="text-sm text-text-muted mt-1">
              Let AI agents use OpenSend on your behalf
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
            <Plus className="size-4" /> New
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

        {newToken && (
          <div className="rounded-2xl p-5 border-2 border-accent/30 bg-accent/5 space-y-3">
            <p className="text-sm font-bold text-accent">Token created — save it now</p>
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

        {tokensLoading ? (
          <div className="text-center py-6">
            <Loader2 className="mx-auto size-5 text-accent animate-spin" />
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">No tokens yet.</p>
        ) : (
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
                        <>
                          {token.token_prefix}
                          {token.last_used_at ? ` · Last used ${formatDate(token.last_used_at)}` : " · Never used"}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {!token.revoked_at && (
                  <button
                    onClick={() => revokeToken(token.id)}
                    disabled={revoking === token.id}
                    className="text-text-secondary hover:text-error transition p-1.5 disabled:opacity-40"
                    title="Revoke"
                  >
                    {revoking === token.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── AI ACCESS / MCP CONNECTION ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-text-primary">AI Access</h2>
        <p className="text-sm text-text-muted">
          Generate a token above, then configure your AI agent to connect to OpenSend.
        </p>

        <div className="space-y-3 text-sm">
          {/* Endpoint */}
          <div className="border-y border-border-default py-3">
            <div className="flex justify-between py-1.5">
              <span className="text-label text-text-muted">Endpoint</span>
              <code className="text-xs font-mono text-accent">{mcpEndpoint}</code>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-label text-text-muted">Auth</span>
              <code className="text-xs font-mono text-text-muted">Authorization: Bearer {"<token>"}</code>
            </div>
          </div>

          {/* Hermes config */}
          <div className="rounded-2xl p-5 bg-bg-surface-muted space-y-2">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-accent" />
              <span className="text-sm font-semibold text-text-primary">Hermes Agent</span>
            </div>
            <pre className="text-xs font-mono text-text-muted whitespace-pre-wrap leading-relaxed">
{`mcp_servers:
  opensend:
    url: ${mcpEndpoint}
    headers:
      Authorization: *** &lt;token&gt;"`}</pre>
          </div>

          {/* Claude Code config */}
          <div className="rounded-2xl p-5 bg-bg-surface-muted space-y-2">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-accent" />
              <span className="text-sm font-semibold text-text-primary">Claude Code</span>
            </div>
            <pre className="text-xs font-mono text-text-muted whitespace-pre-wrap leading-relaxed">
{`{
  "mcpServers": {
    "opensend": {
      "url": "${mcpEndpoint}",
      "headers": {
        "Authorization": "Bearer &lt;token&gt;"
      }
    }
  }
}`}</pre>
          </div>
        </div>
      </div>

      {/* ── SIGN OUT ── */}
      <Button variant="secondary" className="w-full" onClick={signOut}>
        <LogOut className="size-4" /> Sign out
      </Button>
    </div>
  );
}
