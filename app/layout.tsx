import type { Metadata, Viewport } from "next";
import "@fontsource/zen-kaku-gothic-new/400.css";
import "@fontsource/zen-kaku-gothic-new/500.css";
import "@fontsource/zen-kaku-gothic-new/700.css";
import "@fontsource/zen-kaku-gothic-new/900.css";
import "@fontsource/azeret-mono/400.css";
import "@fontsource/azeret-mono/500.css";
import "@fontsource/azeret-mono/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mirai Ledger",
  description: "資産管理と家計簿をひとつに。未来の残高を予測しながら、お金を直感的に動かす。",
  manifest: "/manifest.webmanifest",
  applicationName: "Mirai Ledger",
  appleWebApp: {
    capable: true,
    title: "Mirai Ledger",
    statusBarStyle: "default"
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E9F0EC" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1E22" }
  ]
};

const themeBoot = `(() => {
  try {
    const stored = window.localStorage.getItem('mirai-ledger-theme');
    const theme = stored === 'light' || stored === 'dark' ? stored : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
