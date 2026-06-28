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
import { PageTransition } from "@/components/page-transition";
import { CapacitorFetchProvider } from "@/components/capacitor-fetch-provider";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://send.kovina.org";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "OpenSend — Send files directly",
  description: "Fast, simple, secure peer-to-peer file sharing. No account needed. Send files directly between devices. Open-source, free, ad-free.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "OpenSend",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "OpenSend — Send files directly",
    description: "Fast, simple, secure peer-to-peer file sharing. No account needed. Direct device-to-device transfers.",
    url: "https://send.kovina.org",
    siteName: "OpenSend",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenSend — Send files directly",
    description: "Fast, simple, secure peer-to-peer file sharing. No account needed.",
    images: ["/opengraph-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/icon-152.png", sizes: "152x152", type: "image/png" },
      { url: "/icon-167.png", sizes: "167x167", type: "image/png" },
    ],
    shortcut: { url: "/favicon.ico" },
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
        {/* FOUC/white-flash prevention: set body background before any CSS loads */}
        <style>{`html,body{background-color:#1a0422!important;margin:0;padding:0}`}</style>
        {/* Font preload for faster startup */}
        <link
          rel="preload"
          href="/fonts/NotoSansMath-Regular.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        {/* iOS splash screens */}
        <link rel="apple-touch-startup-image" href="/splash-2048x2732.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash-1668x2388.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash-1536x2048.png" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash-1242x2688.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash-1125x2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash-828x1792.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash-750x1334.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash-640x1136.png" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)" />
      </head>
      <body className="min-h-screen bg-bg-base antialiased pb-safe">
        {/* Loading shell — hidden by React once it mounts */}
        <div id="app-loading-shell" style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: "#1a0422",
          transition: "opacity 0.3s ease",
        }}>
          <div style={{
            width: 32, height: 32,
            border: "3px solid rgba(188,63,222,0.2)",
            borderTopColor: "#bc3fde",
            borderRadius: "50%",
            animation: "os-spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes os-spin{to{transform:rotate(360deg)}}`}</style>
        </div>
        {/* Script to remove loading shell once React takes over */}
        <script dangerouslySetInnerHTML={{
          __html: `document.addEventListener("DOMContentLoaded",()=>{
            const t=setInterval(()=>{
              const el=document.getElementById("app-loading-shell");
              if(el&&document.querySelector("#main-content>*")){
                el.style.opacity="0";
                setTimeout(()=>el.remove(),300);
                clearInterval(t);
              }
            },100);
            setTimeout(()=>{
              const el=document.getElementById("app-loading-shell");
              if(el){el.style.opacity="0";setTimeout(()=>el.remove(),300);}
            },5000);
          })`,
        }} />
        <AuthProvider>
          <ThemeProvider>
            <DeviceProvider>
              <TransferProvider>
                <SiteHeader />
                <main id="main-content" className="mx-auto max-w-2xl px-4 sm:px-6 pt-1 sm:pt-2 pb-6">
                  <CapacitorFetchProvider>
                    <PageTransition>
                      {children}
                    </PageTransition>
                  </CapacitorFetchProvider>
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
