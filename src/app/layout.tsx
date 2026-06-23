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
                      '--color-bg-base:#faf0ff', '--color-bg-surface:#f5e6fa', '--color-bg-surface-muted:#ebd6f0',
                      '--color-text-primary:#1a0422', '--color-text-secondary:#5c3a6b', '--color-text-muted:#8a6b99',
                      '--color-border-default:rgba(90,20,120,0.10)', '--color-accent:#bc3fde', '--color-accent-hover:#a832c4',
                      '--color-error:#c62828', '--color-background:#faf0ff', '--color-foreground:#1a0422',
                      '--color-muted:#ebd6f0', '--color-muted-foreground:#8a6b99', '--color-primary:#bc3fde',
                      '--color-primary-foreground:#1a0422', '--color-border:rgba(90,20,120,0.10)'
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
