"use client";

import { useCallback, useState, useRef } from "react";
import { Check, Copy, Loader2, RotateCcw, X } from "lucide-react";
import { FileDropzone } from "@/components/file-dropzone";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate } from "@/lib/utils";

type TerminalState = "idle" | "uploading" | "done" | "error";

interface UploadResult {
  id: string;
  share_url: string;
  claim_code: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  expires_at: string;
  status: string;
}

export default function UploadPage() {
  const [state, setState] = useState<TerminalState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const handleFileSelected = useCallback(async (f: File) => {
    setFile(f);
    setState("uploading");
    setError(null);
    setProgress(0);

    const formData = new FormData();
    formData.append("file", f);

    try {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      const response = await new Promise<UploadResult>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error || "Upload failed"));
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Network error. Check your connection."));
        xhr.onabort = () => reject(new Error("Upload cancelled."));
        xhr.open("POST", "/api/upload");
        xhr.send(formData);
      });

      setResult(response);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    } finally {
      xhrRef.current = null;
    }
  }, []);

  const handleCopy = async (text: string, type: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback for non-HTTPS or unsupported browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleReset = () => {
    setState("idle");
    setFile(null);
    setResult(null);
    setError(null);
    setProgress(0);
  };

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Hero */}
      <div className="text-center">
        <h1 className="text-hero text-text-primary">Send a file</h1>
        <p className="mt-3 sm:mt-4 text-base sm:text-lg text-text-secondary max-w-lg mx-auto">
          Drop a file, get a link. Share it. They download. Done.
        </p>
      </div>

      {/* Terminal — single column vertical flow */}
      <div className="w-full">
        {state === "idle" && (
          <FileDropzone onFileSelected={handleFileSelected} />
        )}

        {state === "uploading" && (
          <div className="rounded-2xl p-8 sm:p-12 bg-bg-surface-muted text-center space-y-5">
            <Loader2 className="mx-auto size-8 text-accent animate-spin" />
            <div className="space-y-2">
              <p className="text-lg font-bold text-text-primary">Uploading...</p>
              <p className="text-sm text-text-muted break-all max-w-md mx-auto">
                {file?.name} &middot; {file && formatBytes(file.size)}
              </p>
            </div>
            {/* Progress bar */}
            <div className="w-full max-w-xs mx-auto h-1.5 rounded-full bg-bg-base overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">{progress}%</p>
            <button
              onClick={() => {
                xhrRef.current?.abort();
                handleReset();
              }}
              className="text-xs text-text-muted hover:text-text-primary transition"
            >
              Cancel
            </button>
          </div>
        )}

        {state === "done" && result && (
          <div className="space-y-8">
            {/* Result hero */}
            <div className="text-center space-y-4">
              <div className="mx-auto flex size-14 sm:size-16 items-center justify-center rounded-full bg-accent/10">
                <Check className="size-7 sm:size-8 text-accent" />
              </div>
              <p className="text-display text-text-primary">Ready to share</p>
              <p className="text-sm text-text-muted break-all max-w-sm mx-auto">
                {result.file_name} &middot; {formatBytes(result.file_size)}
              </p>
            </div>

            {/* Receipt ticket */}
            <div className="border-t-2 border-dashed border-text-muted/30 pt-6 sm:pt-8 space-y-4">
              {/* Share link */}
              <div className="flex items-center gap-3 py-3 border-b border-border-default">
                <span className="text-label text-text-muted shrink-0 hidden sm:inline">Link</span>
                <span className="text-xs sm:text-sm font-mono text-text-primary flex-1 truncate">
                  {result.share_url}
                </span>
                <button
                  onClick={() => handleCopy(result.share_url, "link")}
                  className="shrink-0 size-9 flex items-center justify-center rounded-full bg-bg-surface-muted hover:bg-[#252525] transition"
                  aria-label="Copy link"
                >
                  {copied === "link" ? <Check className="size-4 text-accent" /> : <Copy className="size-4" />}
                </button>
              </div>

              {/* Claim code */}
              <div className="flex items-center justify-between gap-4 py-3 border-b border-border-default">
                <span className="text-label text-text-muted shrink-0">Code</span>
                <span className="font-mono text-xl sm:text-2xl font-bold text-text-primary tracking-[0.2em]">
                  {result.claim_code}
                </span>
                <button
                  onClick={() => handleCopy(result.claim_code, "code")}
                  className="shrink-0 size-9 flex items-center justify-center rounded-full bg-bg-surface-muted hover:bg-[#252525] transition"
                  aria-label="Copy code"
                >
                  {copied === "code" ? <Check className="size-4 text-accent" /> : <Copy className="size-4" />}
                </button>
              </div>

              {/* Expiry */}
              <div className="flex justify-between py-3 text-sm">
                <span className="text-label text-text-muted">Expires</span>
                <span className="text-text-muted">{formatDate(result.expires_at)}</span>
              </div>

              {/* Ticket footer */}
              <p className="text-center text-xs text-text-muted pt-4">
                &mdash; OpenSend v0.1.2 &mdash;
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="primary"
                size="lg"
                className="flex-1 min-h-[52px]"
                onClick={() => handleCopy(result.share_url, "link")}
              >
                {copied === "link" ? <Check className="size-5" /> : <Copy className="size-5" />}
                Copy link
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="flex-1 min-h-[52px]"
                onClick={handleReset}
              >
                <RotateCcw className="size-5" />
                Send another
              </Button>
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="text-center space-y-6 py-12">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-error/10">
              <X className="size-7 text-error" />
            </div>
            <p className="text-display text-error">Upload failed</p>
            <p className="text-sm text-text-muted max-w-sm mx-auto">{error}</p>
            <Button variant="primary" size="lg" onClick={handleReset}>
              <RotateCcw className="size-5" />
              Try again
            </Button>
          </div>
        )}
      </div>

      {/* Info strip */}
      <div className="border-t border-b border-border-default py-4">
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-label text-text-muted">
          <span>Free &amp; ad-free</span>
          <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
          <span>Up to 50 MB</span>
          <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
          <span>Expires 24h</span>
          <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
          <span>Open-source</span>
        </div>
      </div>
    </div>
  );
}
