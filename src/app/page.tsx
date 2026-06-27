"use client";

import { ArrowUpFromLine, ArrowDownToLine, User } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const { user, signIn } = useAuth();
  const router = useRouter();

  return (
    <div className="space-y-6 py-4">
      <div className="text-center space-y-4">
        <h1 className="text-hero text-text-primary">OpenSend</h1>
        <p className="text-lg text-text-secondary max-w-md mx-auto">
          Send files directly between devices. No account, no sign-up — just a code to share.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 max-w-md mx-auto">
        <button
          onClick={() => router.push("/send")}
          className="rounded-2xl p-8 bg-bg-surface-muted text-center hover:bg-bg-surface-muted/80 transition cursor-pointer space-y-3"
        >
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/10">
            <ArrowUpFromLine className="size-8 text-accent" />
          </div>
          <p className="text-xl font-bold text-text-primary">Send</p>
          <p className="text-sm text-text-muted">Choose a file and share a QR code or pair code</p>
        </button>
        <button
          onClick={() => router.push("/receive")}
          className="rounded-2xl p-8 bg-bg-surface-muted text-center hover:bg-bg-surface-muted/80 transition cursor-pointer space-y-3"
        >
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/10">
            <ArrowDownToLine className="size-8 text-accent" />
          </div>
          <p className="text-xl font-bold text-text-primary">Receive</p>
          <p className="text-sm text-text-muted">Scan a QR code or enter a pair code</p>
        </button>
      </div>

      <div className="border-t border-b border-border-default py-4">
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-label text-text-muted">
          <span>No account needed</span>
          <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
          <span>Encrypted</span>
          <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
          <span>Free &amp; ad-free</span>
          <span className="text-text-muted/30 hidden sm:inline">&middot;</span>
          <span>Open-source</span>
        </div>
      </div>

      {!user && (
        <div className="text-center">
          <button onClick={signIn} className="text-sm text-text-muted hover:text-text-primary transition">
            <User className="size-4 inline mr-1" /> Sign in for trusted devices &amp; sync
          </button>
        </div>
      )}
    </div>
  );
}
