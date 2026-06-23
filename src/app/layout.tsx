import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/theme-toggle";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "OpenSend — File Transfer",
  description: "Fast, simple, secure file sharing. Send files through a link or claim code.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* FOUC prevention: restore theme before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('opensend-theme');
                  if (t === 'light') {
                    var r = document.documentElement;
                    var vars = [
                      '--color-bg-base:#ffffff', '--color-bg-surface:#f5f5f5', '--color-bg-surface-muted:#ebebeb',
                      '--color-text-primary:#000000', '--color-text-secondary:#4a4a4a', '--color-text-muted:#8a8a8a',
                      '--color-border-default:rgba(0,0,0,0.06)', '--color-accent:#bc3fde', '--color-accent-hover:#a832c4',
                      '--color-error:#d32d2d', '--color-background:#ffffff', '--color-foreground:#000000',
                      '--color-muted:#ebebeb', '--color-muted-foreground:#8a8a8a', '--color-primary:#bc3fde',
                      '--color-primary-foreground:#000000', '--color-border:rgba(0,0,0,0.06)'
                    ];
                    for (var i = 0; i < vars.length; i++) {
                      var p = vars[i].indexOf(':');
                      r.style.setProperty(vars[i].slice(0, p), vars[i].slice(p + 1));
                    }
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-bg-base antialiased">
        <AuthProvider>
          <ThemeProvider>
            <SiteHeader />
            <main className="mx-auto max-w-2xl px-6 pt-20 sm:pt-28 pb-12">
              {children}
            </main>
            <SiteFooter />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
