"use client";

// 이 앱을 쓰는 순서(키워드 입력 → 자막 대조 → 결과 확인 → 원본 확인)를 4초마다 바꿔 가며 보여주는 탭 바와 쇼케이스.
// 카드 안의 내용은 "예시 화면"이며 실제 검색 결과가 아니다.

import { useEffect, useState, type ComponentType } from "react";
import Image from "next/image";
import { Check, CirclePlay, FileText, ListChecks, Search } from "lucide-react";

type TabId = "keyword" | "match" | "result" | "source";

const TABS: { id: TabId; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: "keyword", label: "키워드 입력", Icon: Search },
  { id: "match", label: "자막 대조", Icon: FileText },
  { id: "result", label: "결과 확인", Icon: ListChecks },
  { id: "source", label: "원본 확인", Icon: CirclePlay },
];

const CYCLE_MS = 4000;

export function HeroDemo() {
  const [active, setActive] = useState<TabId>("keyword");

  // 탭을 직접 누르면 그 시점부터 다시 4초를 센다.
  useEffect(() => {
    const timer = setInterval(() => {
      setActive((current) => TABS[(TABS.findIndex((tab) => tab.id === current) + 1) % TABS.length].id);
    }, CYCLE_MS);
    return () => clearInterval(timer);
  }, [active]);

  return (
    <div id="how" className="scroll-mt-24">
      {/* 탭 바 */}
      <div
        className="animate-fade-in-up mx-auto mb-8 w-fit rounded-lg bg-secondary-5 p-1"
        style={{ opacity: 0, animationDelay: "0.6s" }}
        role="tablist"
        aria-label="이용 순서"
      >
        <div className="grid grid-cols-2 gap-1 md:hidden">
          {TABS.map((tab) => (
            <TabButton key={tab.id} tab={tab} active={active === tab.id} onSelect={setActive} />
          ))}
        </div>
        <div className="hidden items-center md:flex">
          {TABS.map((tab, index) => (
            <div key={tab.id} className="flex items-center">
              {index > 0 && <span className="h-5 w-px bg-secondary-20" aria-hidden="true" />}
              <TabButton tab={tab} active={active === tab.id} onSelect={setActive} />
            </div>
          ))}
        </div>
      </div>

      {/* 쇼케이스: 모모&페페와 단계별 예시 카드 */}
      <div
        className="animate-fade-in-up relative h-[640px] overflow-hidden rounded-3xl bg-[#ffc72f] md:h-[500px]"
        style={{ opacity: 0, animationDelay: "0.7s" }}
      >
        <Image
          src="/brand/momo-pepe.png"
          alt="재정경제부 캐릭터 모모와 페페"
          width={670}
          height={568}
          priority
          className="absolute bottom-0 left-1/2 h-[34%] w-auto max-w-none -translate-x-1/2 [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)] md:left-auto md:right-[3%] md:h-[96%] md:translate-x-0"
        />

        <div key={active} className="animate-fade-in-overlay absolute inset-0" style={{ opacity: 0 }}>
          <div
            className="animate-slide-up-overlay absolute left-1/2 top-[38%] w-[88%] max-w-sm md:top-1/2 rounded-2xl border border-white/60 bg-white/95 p-5 shadow-xl backdrop-blur md:left-[30%] md:w-[360px]"
            style={{ opacity: 0 }}
          >
            <p className="mb-3 inline-block rounded-full bg-primary-5 px-2.5 py-0.5 text-xs font-medium text-primary-70">
              예시 화면
            </p>
            <OverlayCard active={active} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  tab,
  active,
  onSelect,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  onSelect: (id: TabId) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(tab.id)}
      className={`flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        active ? "bg-white text-primary-70 shadow-sm" : "text-gray-70 hover:text-primary-60"
      }`}
    >
      <tab.Icon className="h-4 w-4" />
      {tab.label}
    </button>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-secondary-10" role="presentation">
      <div className="h-2 rounded-full bg-primary-50" style={{ width: `${percent}%` }} />
    </div>
  );
}

function Steps({ done, current }: { done: number; current: number }) {
  const steps = ["키워드 입력", "자막 대조", "결과 확인", "원본 확인"];
  return (
    <ul className="mt-4 space-y-2 text-sm">
      {steps.map((step, index) => (
        <li key={step} className="flex items-center gap-2">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
              index < done ? "bg-primary-50 text-white" : index === current ? "border-2 border-primary-50 text-primary-60" : "border border-gray-20 text-gray-50"
            }`}
          >
            {index < done ? <Check className="h-3 w-3" /> : index + 1}
          </span>
          <span className={index <= current ? "font-medium text-primary-90" : "text-gray-50"}>{step}</span>
        </li>
      ))}
    </ul>
  );
}

function OverlayCard({ active }: { active: TabId }) {
  if (active === "keyword") {
    return (
      <div>
        <h3 className="text-lg font-semibold text-primary-90">살펴볼 키워드를 입력하세요</h3>
        <p className="mt-1 text-sm text-gray-70">쉼표로 여러 개를 넣으면 하나라도 나온 영상을 모두 보여줍니다.</p>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-gray-20 bg-white px-3 py-2 text-sm">
          <Search className="h-4 w-4 text-gray-50" />
          <span className="text-primary-90">금리, 환율</span>
        </div>
        <div className="mt-4">
          <ProgressBar percent={25} />
        </div>
        <Steps done={0} current={0} />
      </div>
    );
  }

  if (active === "match") {
    return (
      <div>
        <h3 className="text-lg font-semibold text-primary-90">자막에서 찾는 중</h3>
        <p className="mt-1 text-sm text-gray-70">최근 14일 영상의 자막을 띄어쓰기·조사와 관계없이 대조합니다.</p>
        <div className="mt-4">
          <ProgressBar percent={50} />
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <Metric label="대상 채널" value="24개 주요 채널" />
          <Metric label="조회 범위" value="최근 14일" />
          <Metric label="그 밖의 채널" value="제목·태그·설명" />
        </dl>
        <Steps done={1} current={1} />
      </div>
    );
  }

  if (active === "result") {
    return (
      <div>
        <h3 className="text-lg font-semibold text-primary-90">언급한 구절을 모아서 보여줍니다</h3>
        <div className="mt-3 rounded-lg bg-secondary-5 p-3 text-sm leading-relaxed text-gray-70">
          <p className="mb-1 text-xs text-gray-50">예시 채널 · 영상 제목 예시</p>
          <p>
            …오늘 한국은행이 기준 <mark className="rounded bg-yellow-300/70 px-0.5 text-inherit">금리</mark>를 동결했는데요…
          </p>
        </div>
        <p className="mt-2 text-xs text-gray-50">자막 원문 앞뒤 15초 · 영상당 최대 3곳</p>
        <div className="mt-4">
          <ProgressBar percent={75} />
        </div>
        <Steps done={2} current={2} />
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-primary-90">원본 영상에서 바로 확인</h3>
      <p className="mt-1 text-sm text-gray-70">언급한 시점으로 이동하는 링크가 구절마다 붙습니다.</p>
      <div className="mt-3 flex items-center justify-between rounded-lg border border-primary-20 bg-primary-5 px-3 py-2.5 text-sm">
        <span className="flex items-center gap-2 font-medium text-primary-70">
          <CirclePlay className="h-4 w-4" />
          6:46부터 보기
        </span>
        <span className="text-xs text-primary-60">새 창에서 열림</span>
      </div>
      <div className="mt-4">
        <ProgressBar percent={100} />
      </div>
      <Steps done={4} current={3} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-70">{label}</dt>
      <dd className="font-medium text-primary-90">{value}</dd>
    </div>
  );
}
