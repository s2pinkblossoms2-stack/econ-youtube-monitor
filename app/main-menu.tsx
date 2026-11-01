"use client";

// 공식 홈페이지처럼 흰 바탕의 가로 메뉴 줄. 지금 보고 있는 메뉴에 파란 밑줄이 간다.

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "키워드 검색", match: (path: string) => path === "/" },
  { href: "/coverage", label: "수집 현황", match: (path: string) => path.startsWith("/coverage") },
  { href: "/channels", label: "채널 관리", match: (path: string) => path.startsWith("/channels") },
  { href: "/#guide", label: "이용 안내", match: () => false },
];

export function MainMenu() {
  const pathname = usePathname();
  return (
    <nav aria-label="주 메뉴" className="border-y border-gray-20 bg-white">
      <ul className="mx-auto flex max-w-[1280px] px-3 sm:px-6">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block border-b-4 px-4 py-3 text-base font-semibold sm:px-6 ${
                  active ? "border-primary-60 text-primary-60" : "border-transparent text-gray-80 hover:text-primary-60"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
