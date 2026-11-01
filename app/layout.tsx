import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteFooter, SiteNav } from "./site-chrome";

// 영문·숫자는 Inter, 한글은 시스템의 한글 글꼴로 보인다. (globals.css의 글꼴 순서 참고)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "경제 유튜브 여론 모니터",
  description: "경제 유튜브 영상의 최근 2주 자막에서 키워드 언급을 찾아 링크와 함께 보여주는 내부 도구",
  // 담당팀 내부 도구라 검색 엔진에 나오지 않게 한다. (보안 점검 SEC-003)
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-white">
        <SiteNav />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
