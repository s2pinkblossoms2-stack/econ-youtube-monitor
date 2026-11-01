// 화면 맨 위의 "홈 > 현재 화면" 경로와 제목. 공식 홈페이지의 하위 화면과 같은 짜임이다.

import Link from "next/link";
import type { ReactNode } from "react";

export function PageTitle({ current, title, children }: { current: string; title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1280px] px-6 pb-2 pt-8">
      <nav aria-label="현재 위치" className="mb-3 text-sm text-gray-50">
        <Link href="/" className="hover:text-primary-60">
          홈
        </Link>
        <span className="mx-2" aria-hidden="true">
          &gt;
        </span>
        <span className="text-gray-70">{current}</span>
      </nav>
      <h1 className="text-3xl font-bold text-primary-90 sm:text-4xl">{title}</h1>
      {children && <p className="mt-2 max-w-3xl text-gray-70">{children}</p>}
    </div>
  );
}
