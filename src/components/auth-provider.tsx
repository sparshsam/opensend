"use client";

import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { nativeGoogleSignIn, resetAuthStage } from "@/lib/native-google-auth";
import { trackSignInClicked, trackNativeAttempted, trackAuthError } from "@/lib/auth-diag";

interface AuthContext {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthContext>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    console.log("[auth] signIn() called");
    trackSignInClicked();
    resetAuthStage();
    const isCapacitor = typeof (window as any).Capacitor?.Plugins?.Browser !== "undefined";
    if (isCapacitor) {
      // ── Native Android: Chrome Custom Tab → deep link → PKCE exchange ──
      console.log("[auth] native — calling nativeGoogleSignIn");
      trackNativeAttempted();
      try {
        await nativeGoogleSignIn(supabase);
        console.log("[auth] nativeGoogleSignIn completed successfully");
      } catch (err: any) {
        console.log("[auth] nativeGoogleSignIn failed:", err.message);
        trackAuthError(err.message || "Native sign-in error");
        throw err;
      }
    } else {
      // ── Web / PWA: standard popup / redirect ──
      console.log("[auth] web — redirect OAuth");
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/auth/callback",
        },
      });
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
