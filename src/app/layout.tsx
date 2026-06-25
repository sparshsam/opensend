import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/theme-toggle";
import { DeviceProvider } from "@/components/device-provider";
import { TransferProvider } from "@/components/transfer-provider";
import { PwaScripts } from "@/components/pwa-scripts";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "OpenSend — Send files directly",
  description: "Fast, simple, secure file sharing between devices. No account needed. Send files peer-to-peer without uploads.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "OpenSend",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#bc3fde",
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
                    document.documentElement.classList.add('light');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
        {/* iOS splash screens */}
        <link rel="apple-touch-startup-image" href="/splash-2048x2732.svg" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash-1242x2688.svg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-icon" href="/icon-192x192.svg" />
      </head>
      <body className="min-h-screen bg-bg-base antialiased pb-safe">
        <AuthProvider>
          <ThemeProvider>
            <DeviceProvider>
              <TransferProvider>
                <SiteHeader />
                <main className="mx-auto max-w-2xl px-4 sm:px-6 pt-24 sm:pt-28 pb-24">
                  {children}
                </main>
                <SiteFooter />
                <PwaScripts />
              </TransferProvider>
            </DeviceProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
