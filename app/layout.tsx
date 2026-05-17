import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mirai Ledger — Personal Wealth OS",
  description: "資産管理と家計簿をひとつに。未来の残高を予測しながら、お金を直感的に動かす。",
  manifest: "/manifest.webmanifest",
  applicationName: "Mirai Ledger",
  appleWebApp: {
    capable: true,
    title: "Mirai Ledger",
    statusBarStyle: "black-translucent"
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
  themeColor: "#0b1024"
};

const themeBoot = `(() => {
  try {
    const stored = window.localStorage.getItem('mirai-ledger-theme');
    const theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
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
