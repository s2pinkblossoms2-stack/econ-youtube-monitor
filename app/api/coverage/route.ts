// GET /api/coverage — 24개 주요 채널별로 최근 14일 영상의 자막 확인 현황(확인 완료·확인불가·대기)을 돌려준다.
// 유튜브에 공개된 영상 정보만 담고 있고, 화면의 채널 목록과 같은 내용이라 비밀번호 없이 볼 수 있다.

import { getDb } from "@/lib/db/client";
import { RETENTION_DAYS } from "@/lib/search/constants";

const HEADERS = { "Cache-Control": "no-store" };

export type ChannelCoverage = {
  id: number;
  name: string;
  lastCheckedAt: string | null;
  total: number;
  ok: number;
  none: number;
  pending: number;
};

export async function GET(): Promise<Response> {
  const since = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getDb().rpc("channel_coverage", { since });
  if (error) {
    console.error("수집 현황 읽기 실패:", error.message);
    return Response.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 503, headers: HEADERS });
  }
  return Response.json({ channels: (data ?? []) as ChannelCoverage[], since }, { headers: HEADERS });
}
