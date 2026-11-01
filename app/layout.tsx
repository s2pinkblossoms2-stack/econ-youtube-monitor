import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "경제 유튜브 여론 모니터",
  description: "경제 유튜브 영상의 최근 2주 자막에서 키워드 언급을 찾아 링크와 함께 보여주는 내부 도구",
  // 담당팀 내부 도구라 검색 엔진에 나오지 않게 한다. (보안 점검 SEC-003)
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
