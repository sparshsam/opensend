import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border-default px-6 py-12 mt-28">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-6 sm:flex-row">
        <p className="text-xs text-text-muted">
          OpenSend — open-source file sharing
        </p>
        <nav className="flex gap-6">
          <Link
            href="/privacy"
            className="text-xs text-text-secondary hover:text-text-primary transition"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="text-xs text-text-secondary hover:text-text-primary transition"
          >
            Terms
          </Link>
          <Link
            href="/support"
            className="text-xs text-text-secondary hover:text-text-primary transition"
          >
            Support
          </Link>
        </nav>
      </div>
    </footer>
  );
}
