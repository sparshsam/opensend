import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/theme-toggle";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800", "900"],
});

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
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* FOUC prevention: restore theme before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('opensend-theme');
                  if (t === 'light') document.documentElement.className = 'light';
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
