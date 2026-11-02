// 모든 화면 위(알림 줄·머리말·메뉴)와 아래(바닥글)에 붙는 공통 영역. 재정경제부 공식 홈페이지의 짜임을 따른다.

import Image from "next/image";
import Link from "next/link";
import { MainMenu } from "./main-menu";

export function SiteHeader() {
  return (
    <header className="bg-white">
      {/* 맨 위 알림 줄 */}
      <div className="border-b border-gray-10 bg-secondary-5">
        <p className="mx-auto max-w-[1280px] px-6 py-1.5 text-xs text-gray-70">
          이 누리집은 재정경제부 대변인실 유튜브 담당팀의 내부 도구입니다.
        </p>
      </div>

      {/* 로고와 서비스 이름 */}
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-4">
          <Image src="/brand/mofe-logo.svg" alt="재정경제부" width={167} height={48} className="h-9 w-auto" priority />
          <span className="hidden h-6 w-px bg-gray-20 sm:block" aria-hidden="true" />
          <span className="hidden text-xl font-bold text-primary-90 sm:block">경제 유튜브 여론 모니터</span>
        </Link>
        <a
          href="https://mofe.go.kr/"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full border border-gray-20 px-4 py-1.5 text-sm text-gray-70 hover:border-primary-50 hover:text-primary-60"
        >
          재정경제부 홈페이지 ↗
        </a>
      </div>

      {/* 메뉴 줄 */}
      <MainMenu />
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-gray-20 bg-white">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-6 py-10 md:flex-row md:items-start md:justify-between">
        <div>
          <Image src="/brand/mofe-logo.svg" alt="재정경제부" width={167} height={48} className="mb-4 h-8 w-auto" />
          <p className="text-sm text-gray-70">재정경제부 대변인실 유튜브 담당팀 내부 도구</p>
          <p className="mt-1 text-sm text-gray-70">공개된 영상의 자막과 제목·태그·설명만 사용하며, 자막은 14일이 지나면 삭제합니다.</p>
        </div>
        <ul className="space-y-2 text-sm text-gray-70">
          <li>자동 자막 기준이라 오인식이 있을 수 있습니다. 언급 구절은 원본 영상에서 확인해 주세요.</li>
          <li>
            <a href="https://mofe.go.kr/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary-60">
              재정경제부 누리집 바로가기
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
