"use client";

import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";

export default function ProfilePage() {
  const { user, loading, signIn, signOut } = useAuth();

  return (
    <div className="space-y-10">
      <div className="text-center">
        <h1 className="text-display text-text-primary">Profile</h1>
      </div>

      <div className="space-y-6">
        {loading ? (
          <div className="py-12 text-center">
            <p className="text-sm text-text-muted">Loading...</p>
          </div>
        ) : user ? (
          <>
            {/* User info strip */}
            <div className="border-t border-b border-border-default py-4 space-y-3">
              <div className="flex justify-between py-2">
                <span className="text-label text-text-muted">Email</span>
                <span className="text-sm text-text-primary">{user.email}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-label text-text-muted">Joined</span>
                <span className="text-sm text-text-muted">
                  {new Date(user.created_at).toLocaleDateString("en-US", {
                    month: "long", day: "numeric", year: "numeric",
                  })}
                </span>
              </div>
            </div>

            <Button variant="secondary" className="w-full" onClick={signOut}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </>
        ) : (
          <div className="text-center space-y-6 py-8">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-bg-surface-muted">
              <User className="size-6 text-text-muted" />
            </div>
            <p className="text-base text-text-secondary max-w-xs mx-auto">
              Sign in to view your transfer history and manage your files.
            </p>
            <Button variant="primary" size="lg" onClick={signIn}>
              Sign in with GitHub
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
