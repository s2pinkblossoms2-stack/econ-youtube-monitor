import { Suspense } from "react";
import { getDb } from "@/lib/db/client";
import { MAIN_CHANNELS } from "@/scripts/main-channels";
import { PageTitle } from "./page-title";
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

async function ChannelNames() {
  const names = await loadChannelNames();
  return (
    <>
      <p className="mb-3 text-sm text-gray-70">지금 자막까지 모두 확인하는 주요 채널은 {names.length}개입니다. (채널 관리에서 바꿀 수 있습니다)</p>
      <ul className="flex flex-wrap gap-2">
        {names.map((name) => (
          <li key={name} className="rounded border border-gray-30 px-3 py-1 text-sm text-gray-70">
            {name}
          </li>
        ))}
      </ul>
    </>
  );
}

const STEPS = [
  { title: "키워드 입력", body: "살펴볼 키워드를 쉼표로 구분해 넣거나, 등록해 둔 키워드를 한 번에 검색합니다." },
  { title: "자막 대조", body: "최근 14일 영상의 자막을 띄어쓰기·조사와 관계없이 대조합니다." },
  { title: "결과 확인", body: "언급한 구절을 자막 원문 그대로, 앞뒤 15초와 함께 모아 보여줍니다." },
  { title: "원본 확인", body: "구절마다 붙은 링크로 해당 시점의 원본 영상을 새 창에서 엽니다." },
];

const NOTES = [
  {
    q: "\"확인불가\"는 무슨 뜻인가요?",
    a: "24개 주요 채널의 영상 중 자막을 받지 못한 영상입니다. 영상에서 한 말은 확인하지 못했고, 제목·태그·설명에 키워드가 있어 언급했을 가능성이 높은 영상만 따로 모아 보여줍니다.",
  },
  {
    q: "\"그 밖의 채널\"은 어떻게 찾나요?",
    a: "등록한 키워드로 유튜브를 검색해, 24개 주요 채널이 아닌 채널의 영상 중 제목·태그·설명에 키워드가 있는 영상을 모읍니다. 구독자 수와 관계없으며 자막은 확인하지 않습니다. 새 키워드는 다음 수집부터 나옵니다.",
  },
  {
    q: "자막이 틀릴 때도 있나요?",
    a: "유튜브 자동 자막은 경제 용어를 잘못 받아 적을 수 있습니다(예: \"금통위\"가 \"금통이\"로). 그래서 언급 구절 옆에 \"자동 자막 기준\"을 표시하니, 중요한 내용은 원본 영상에서 확인해 주세요.",
  },
];

export default function Home() {
  return (
    <main className="pb-8">
      <PageTitle current="키워드 검색" title="키워드 검색">
        키워드를 입력하면 최근 2주 안에 올라온 경제 유튜브 영상에서 언급한 구절을 찾아, 원본 영상 링크와 함께 모아 보여줍니다.
      </PageTitle>

      <div className="mx-auto max-w-[1280px] space-y-6 px-6 pt-6">
        {/* 안내 배너: 공식 홈페이지의 남색 배너 */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl bg-linear-to-r from-primary-90 via-primary-80 to-primary-60 px-6 py-4 text-white">
          <p className="text-lg font-bold">조회 안내</p>
          <p className="text-sm sm:text-base">
            범위 <strong className="ml-1">최근 14일</strong>
          </p>
          <p className="text-sm sm:text-base">
            주요 채널 <strong className="ml-1">자막 전체 대조</strong>
          </p>
          <p className="text-sm sm:text-base">
            그 밖의 채널 <strong className="ml-1">제목·태그·설명</strong>
          </p>
        </div>

        <SearchPanel />

        <section id="guide" className="scroll-mt-4 pt-6">
          <h2 className="mb-4 flex items-center gap-2 border-l-4 border-primary-60 pl-3 text-xl font-bold text-primary-90">이용 안내</h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-xl border border-gray-20 bg-white p-5">
                <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary-60 text-sm font-bold text-white">{index + 1}</span>
                <h3 className="mb-1 text-lg font-semibold text-primary-90">{step.title}</h3>
                <p className="text-sm text-gray-70">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-4 divide-y divide-gray-10 rounded-xl border border-gray-20 bg-white">
            {NOTES.map((note) => (
              <details key={note.q} className="group p-5">
                <summary className="cursor-pointer list-none font-semibold text-primary-90 marker:content-none">
                  <span className="mr-2 text-primary-60 group-open:hidden">+</span>
                  <span className="mr-2 hidden text-primary-60 group-open:inline">−</span>
                  {note.q}
                </summary>
                <p className="mt-2 pl-5 text-sm text-gray-70">{note.a}</p>
              </details>
            ))}
            <details className="group p-5">
              <summary className="cursor-pointer list-none font-semibold text-primary-90 marker:content-none">
                <span className="mr-2 text-primary-60 group-open:hidden">+</span>
                <span className="mr-2 hidden text-primary-60 group-open:inline">−</span>
                지금 살펴보는 주요 채널 보기
              </summary>
              <div className="mt-3 pl-5">
                <Suspense fallback={<p className="text-sm text-gray-50">주요 채널을 불러오는 중…</p>}>
                  <ChannelNames />
                </Suspense>
              </div>
            </details>
          </div>
        </section>
      </div>
    </main>
  );
}
