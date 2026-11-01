// GET /api/export?keywords=금리,환율&part=1 — 검색 결과를 txt 파일로 내려받는다. (300개 영상씩 나눈 묶음)
// 검색과 같은 규칙으로 입력을 검사하고, 파일에는 링크·제목·채널명·게시일·언급 시간대와 자막 원문 구절이 들어간다.

import { getDb } from "@/lib/db/client";
import { exportFileName, formatExport } from "@/lib/search/export-text";
import { exportMentions } from "@/lib/search/search";
import { EXPORT_PART_SIZE, parseExportParams } from "@/lib/search/validate";

// 영상 300개의 자막 원본을 읽는 데 20초 안팎이 걸릴 수 있다.
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const parsed = parseExportParams(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return Response.json({ error: parsed.message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { keywords, part } = parsed.value;
    const result = await exportMentions(getDb(), keywords, part);
    const generatedAt = new Date();
    const text = formatExport(
      result.items.map((item) => ({ item })),
      {
        keywords,
        generatedAt,
        part: { number: result.part, count: result.partCount, size: EXPORT_PART_SIZE, total: result.total },
        totals: { main: result.totalMain, unverified: result.totalUnverified, small: result.totalSmall },
      },
    );
    const fileName = exportFileName(keywords, generatedAt, result.partCount > 1 ? part : undefined);
    // 윈도우 메모장에서도 한글이 깨지지 않게 파일 맨 앞에 BOM을 붙인다.
    return new Response("﻿" + text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    // 저장소 오류 원문은 응답에 내보내지 않고 서버 로그에만 남긴다. (보안 점검 SEC-011)
    console.error("내려받기 실패:", e instanceof Error ? e.message : "알 수 없는 오류");
    return Response.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
