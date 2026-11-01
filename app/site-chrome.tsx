// 모든 화면 위(내비게이션)와 아래(바닥글)에 붙는 공통 영역

import Image from "next/image";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/#search", label: "검색하기" },
  { href: "/#how", label: "사용 방법" },
  { href: "/#channels", label: "주요 채널" },
  { href: "/channels", label: "채널 관리" },
];

export function SiteNav() {
  return (
    <nav
      aria-label="주 메뉴"
      className="animate-fade-in-up mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4"
      style={{ opacity: 0, animationDelay: "0.1s" }}
    >
      <Link href="/" className="flex items-center gap-3">
        <Image src="/brand/mofe-logo.png" alt="재정경제부" width={181} height={47} className="h-7 w-auto" priority />
        <span className="hidden h-5 w-px bg-gray-20 sm:block" aria-hidden="true" />
        <span className="hidden text-lg font-semibold text-primary-90 sm:block">여론 모니터</span>
      </Link>

      <div className="hidden items-center gap-8 md:flex">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="text-sm text-gray-70 hover:text-primary-60">
            {link.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <a
          href="https://mofe.go.kr/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden text-sm text-gray-70 hover:text-primary-60 lg:block"
        >
          재정경제부 홈페이지
        </a>
        <Link
          href="/#search"
          className="rounded-full bg-primary-60 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-70"
        >
          검색 시작하기
        </Link>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-gray-20 bg-secondary-5">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-8 text-sm text-gray-70 sm:flex-row sm:items-center sm:justify-between">
        <p>재정경제부 대변인실 유튜브 담당팀 내부 도구입니다. 공개된 영상의 자막과 제목·태그·설명만 사용합니다.</p>
        <p>자동 자막 기준이라 오인식이 있을 수 있으니, 언급 구절은 원본 영상에서 확인해 주세요.</p>
      </div>
    </footer>
  );
}
