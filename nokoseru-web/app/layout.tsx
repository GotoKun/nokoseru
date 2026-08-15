import type { Metadata } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";
import { TouchActiveFix } from "./components/km/TouchActiveFix";
import { RouteDeco } from "./components/km/RouteDeco";

const zenMaruGothic = Zen_Maru_Gothic({
  variable: "--font-zen-maru-gothic",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "カエルム",
  description: "温かいが、湿っぽくない。生前の話を、節目にご家族へ届ける終活サポートアプリ「カエルム」",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${zenMaruGothic.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <TouchActiveFix />
        <RouteDeco />
        {children}
      </body>
    </html>
  );
}
