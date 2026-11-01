// Design Ref: §4.2 — GET /api/search?keywords=금리,환율&page=1
// 서버에서만 실행된다. 저장소 키는 lib/db/client.ts가 .env에서 읽고 브라우저로는 나가지 않는다.

import { getDb } from "@/lib/db/client";
import { searchMentions } from "@/lib/search/search";
import { parseSearchParams } from "@/lib/search/validate";

// 검색 결과(키워드 포함)가 중간에 저장되지 않게 한다.
const HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const parsed = parseSearchParams(new URL(request.url).searchParams);
  if (!parsed.ok) return Response.json({ error: parsed.message }, { status: 400, headers: HEADERS });

  try {
    const result = await searchMentions(getDb(), parsed.value.keywords, parsed.value.page);
    return Response.json(result, { headers: HEADERS });
  } catch (e) {
    // 저장소 오류 원문은 응답에 내보내지 않고 서버 로그에만 남긴다. (DESIGN §6, 보안 점검 SEC-011)
    console.error("검색 실패:", e instanceof Error ? e.message : "알 수 없는 오류");
    return Response.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 503, headers: HEADERS });
  }
}
