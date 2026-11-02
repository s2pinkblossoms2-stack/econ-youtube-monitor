import { PageTitle } from "./page-title";
import { SearchPanel } from "./search-panel";

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
            그 밖의 채널 <strong className="ml-1">검색 후 자막 확인</strong>
          </p>
        </div>

        <SearchPanel />
      </div>
    </main>
  );
}
