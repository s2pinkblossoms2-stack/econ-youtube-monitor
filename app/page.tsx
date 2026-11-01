import { ArrowRight, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/lib/db/client";
import { MAIN_CHANNELS } from "@/scripts/main-channels";
import { HeroDemo } from "./hero-demo";
import { SearchPanel } from "./search-panel";

// 지금 사용 중인 24개 주요 채널의 이름. 저장소를 읽지 못하면 기본 목록을 보여준다.
// 채널 관리 화면에서 바뀔 수 있어 요청할 때마다 읽는다. (Cache Components: 요청 시점 데이터는 Suspense 안에서 읽는다)
async function loadChannelNames(): Promise<string[]> {
  try {
    const { data, error } = await getDb().from("channels").select("name").eq("kind", "main").eq("active", true).order("name");
    if (error || !data || data.length === 0) throw new Error("채널 목록 없음");
    return (data as { name: string }[]).map((row) => row.name);
  } catch {
    return MAIN_CHANNELS.map((channel) => channel.name);
  }
}

async function ChannelStrip() {
  const channelNames = await loadChannelNames();
  return (
    <>
      <p className="mb-6 text-sm font-medium text-gray-70">지금 살펴보는 주요 채널 {channelNames.length}개</p>
      <ul className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-3">
        {channelNames.map((name) => (
          <li key={name} className="rounded-full border border-gray-20 px-4 py-1.5 text-sm text-gray-70">
            {name}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Home() {
  return (
    <main>
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16 text-center sm:pt-24">
        <div className="animate-fade-in-up mb-8 inline-flex items-center gap-2" style={{ opacity: 0, animationDelay: "0.2s" }}>
          <span className="flex h-6 w-6 items-center justify-center rounded border border-primary-30 bg-primary-5">
            <Users className="h-3.5 w-3.5 text-primary-60" />
          </span>
          <span className="text-sm font-medium text-primary-90">재정경제부 대변인실 유튜브 담당팀 전용 · 최근 14일 · 24개 주요 채널</span>
        </div>

        <h1
          className="animate-fade-in-up mb-5 text-4xl font-normal leading-[1.15] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
          style={{ opacity: 0, animationDelay: "0.3s" }}
        >
          <span className="text-primary-90">영상을 다 보지 않아도,</span>
          <br />
          <span className="bg-linear-to-r from-primary-90 via-primary-50 to-primary-30 bg-clip-text text-transparent">
            경제 유튜브의 말을 한눈에
          </span>
        </h1>

        <p
          className="animate-fade-in-up mx-auto mb-8 max-w-2xl text-lg text-gray-70 md:text-xl"
          style={{ opacity: 0, animationDelay: "0.4s" }}
        >
          키워드를 입력하면 최근 2주 안에 올라온 영상의 자막에서 언급한 구절을 찾아, 원본 영상 링크와 함께 모아 보여드립니다.
        </p>

        <div className="animate-fade-in-up mb-12" style={{ opacity: 0, animationDelay: "0.5s" }}>
          <Link
            href="#search"
            className="inline-flex items-center gap-2 rounded-full bg-primary-60 px-8 py-3 text-base font-medium text-white transition-colors hover:bg-primary-70"
          >
            검색 시작하기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <HeroDemo />

        <div id="channels" className="animate-fade-in-up mt-24 scroll-mt-24" style={{ opacity: 0, animationDelay: "0.8s" }}>
          <Suspense fallback={<p className="text-sm text-gray-50">주요 채널을 불러오는 중…</p>}>
            <ChannelStrip />
          </Suspense>
        </div>
      </section>

      <section id="search" className="scroll-mt-4 bg-secondary-5 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-2 text-2xl font-bold text-primary-90 sm:text-3xl">키워드로 찾아보기</h2>
          <p className="mb-6 text-gray-70">
            결과는 &ldquo;24개 주요 채널&rdquo;, &ldquo;확인불가(자막을 받지 못한 영상)&rdquo;, &ldquo;그 밖의 채널&rdquo; 순서로 나뉘어 나옵니다.
          </p>
          <SearchPanel />
        </div>
      </section>
    </main>
  );
}
