"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/", label: "Transfer" },
  { href: "/history", label: "History" },
  { href: "/diagnostics", label: "Diagnostics" },
  { href: "/profile", label: "Profile" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-bg-base/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4 gap-4">
        <Link href="/" className="text-lg font-bold text-text-primary shrink-0">
          OpenSend
        </Link>

        <nav className="flex items-center gap-1 flex-1 justify-center">
          {navItems.map((item) => {
            const isActive = item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  isActive
                    ? "bg-bg-surface-muted text-text-primary"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
