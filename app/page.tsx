import { SearchPanel } from "./search-panel";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="text-3xl font-bold sm:text-4xl">경제 유튜브 여론 모니터</h1>
      <p className="mb-6 mt-2 text-foreground/70">
        키워드를 입력하면 경제 유튜브 영상 중 최근 2주 안에 그 말을 한 곳을 자막 원문과 링크로 보여줍니다.
      </p>
      <SearchPanel />
    </main>
  );
}
