import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mirai Ledger",
    short_name: "Mirai",
    description: "資産管理と家計簿をひとつにした残高予測アプリ",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f3ec",
    theme_color: "#0f766e",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
