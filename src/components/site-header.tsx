"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowLeftRight, Clock, Bug, User } from "lucide-react";

const navItems = [
  { href: "/", label: "Transfer", icon: ArrowLeftRight },
  { href: "/history", label: "History", icon: Clock },
  { href: "/diagnostics", label: "Diagnostics", icon: Bug },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <>
      {/* Skip-to-content link for screen readers */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-full focus:bg-accent focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white focus:outline-none"
      >
        Skip to content
      </a>

      {/* Top header bar */}
      <header
        className="sticky top-0 z-50 bg-bg-base/90 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        role="banner"
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 sm:px-6 py-2 sm:py-3 gap-2">
          <Link
            href="/"
            className="text-lg font-bold text-text-primary shrink-0"
            aria-label="OpenSend home"
          >
            OpenSend
          </Link>

          {/* Desktop nav — hidden on mobile */}
          <nav className="hidden sm:flex items-center gap-1 flex-1 justify-center overflow-x-auto" aria-label="Main navigation">
            {navItems.map((item) => {
              const isActive = item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap flex items-center gap-1.5",
                    isActive
                      ? "bg-bg-surface-muted text-text-primary"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
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

      {/* Mobile bottom nav — hidden on desktop */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-bg-base/95 backdrop-blur-md border-t border-border-default sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-around px-2 py-1">
          {navItems.map((item) => {
            const isActive = item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-2 min-w-[64px] min-h-[48px] rounded-xl text-xs font-medium transition",
                  isActive
                    ? "text-accent"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Spacer for mobile bottom nav so content isn't hidden behind it */}
      <div className="h-16 sm:hidden" />
    </>
  );
}
