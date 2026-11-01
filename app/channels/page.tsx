import type { Metadata } from "next";
import { PageTitle } from "../page-title";
import { ChannelManager } from "./channel-manager";

export const metadata: Metadata = {
  title: "채널 관리 · 경제 유튜브 여론 모니터",
};

export default function ChannelsPage() {
  return (
    <main className="pb-8">
      <PageTitle current="채널 관리" title="채널 관리">
        24개 주요 채널(자막까지 모두 확인하는 채널)을 추가하거나 끕니다. 바꾼 내용은 다음 수집(<code>npm run collect</code>)부터 반영됩니다.
      </PageTitle>
      <div className="mx-auto max-w-[1280px] px-6 pt-6">
        <div className="max-w-3xl">
          <ChannelManager />
        </div>
      </div>
    </main>
  );
}
