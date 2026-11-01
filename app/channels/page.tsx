import type { Metadata } from "next";
import Link from "next/link";
import { ChannelManager } from "./channel-manager";

export const metadata: Metadata = {
  title: "채널 관리 · 경제 유튜브 여론 모니터",
};

export default function ChannelsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <p className="mb-4 text-sm">
        <Link href="/" className="underline underline-offset-2">
          ← 검색으로 돌아가기
        </Link>
      </p>
      <h1 className="text-3xl font-bold">채널 관리</h1>
      <p className="mb-6 mt-2 text-foreground/70">
        24개 주요 채널(자막까지 모두 확인하는 채널)을 추가하거나 끕니다. 바꾼 내용은 다음 수집(<code>npm run collect</code>)부터
        반영됩니다.
      </p>
      <ChannelManager />
    </main>
  );
}
