"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, Trash2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { formatDate } from "@/lib/utils";

interface McpToken {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export function McpTokensPanel() {
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/mcp/tokens");
      if (res.ok) {
        setTokens(await res.json());
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const createToken = async () => {
    setCreating(true);
    setNewToken(null);
    try {
      const res = await apiFetch("/api/mcp/tokens", {
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
    } catch {
      // Silently fail
    } finally {
      setCreating(false);
    }
  };

  const revokeToken = async (id: string) => {
    try {
      const res = await apiFetch(`/api/mcp/tokens/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadTokens();
      }
    } catch {
      // Silently fail
    }
  };

  const copyToken = async () => {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-primary">MCP Access Tokens</h2>
          <p className="text-sm text-text-muted mt-1">
            Tokens let AI agents access OpenSend on your behalf
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          <Plus className="size-4" /> New token
        </Button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="rounded-2xl p-5 bg-bg-surface-muted space-y-4">
          <p className="text-sm font-semibold text-text-primary">Create a new access token</p>
          <input
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            placeholder="Token name (e.g. Claude Code)"
            maxLength={100}
            className="w-full rounded-full px-5 py-3 bg-bg-base text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={creating || !tokenName.trim()}
            onClick={createToken}
          >
            {creating ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            {creating ? "Creating..." : "Generate token"}
          </Button>
        </div>
      )}

      {/* New token display — shown once after creation */}
      {newToken && (
        <div className="rounded-2xl p-5 border-2 border-accent/30 bg-accent/5 space-y-3">
          <p className="text-sm font-bold text-accent">Token created — save it now</p>
          <p className="text-xs text-text-muted">
            This is the only time you will see this token. If you lose it, you will need to revoke it and create a new one.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-bg-base rounded-full px-4 py-2.5 text-text-primary break-all select-all">
              {newToken}
            </code>
            <Button variant="secondary" size="sm" onClick={copyToken}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <p className="text-xs text-text-muted">Use this token in your AI agent configuration as a Bearer token or OPENSEND_ACCESS_TOKEN environment variable.</p>
        </div>
      )}

      {/* Token list */}
      {loading ? (
        <div className="text-center py-8">
          <Loader2 className="mx-auto size-5 text-accent animate-spin" />
        </div>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">No access tokens yet. Create one to let AI agents use OpenSend on your behalf.</p>
      ) : (
        <div className="space-y-2">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between gap-3 rounded-full px-5 py-3.5 bg-bg-surface-muted/30"
            >
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
                  className="text-text-secondary hover:text-error transition p-1.5"
                  title="Revoke token"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
