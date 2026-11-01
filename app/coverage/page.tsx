import type { Metadata } from "next";
import { PageTitle } from "../page-title";
import { CoverageView } from "./coverage-view";

export const metadata: Metadata = {
  title: "수집 현황 · 경제 유튜브 여론 모니터",
};

export default function CoveragePage() {
  return (
    <main className="pb-8">
      <PageTitle current="수집 현황" title="수집 현황">
        24개 주요 채널의 최근 14일 영상을 모두 확인했는지 채널별·영상별로 보여줍니다. &ldquo;확인불가&rdquo;는 자막을 받지 못해 영상에서 한 말을 확인하지 못한 영상입니다.
      </PageTitle>
      <div className="mx-auto max-w-[1280px] px-6 pt-6">
        <CoverageView />
      </div>
    </main>
  );
}
