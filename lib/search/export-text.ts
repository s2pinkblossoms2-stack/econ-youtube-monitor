// 검색 결과를 내려받는 txt 파일의 내용을 만든다. 브라우저(이 화면 내려받기)와 서버(전체 내려받기)가 같은 함수를 쓴다.
// 담는 것: 링크, 영상 제목, 채널명, 게시 날짜, 언급한 시간대와 내용.
// "내용"은 요약이 아니라 자막 원문(앞뒤 15초)이다. (PRD: 자막은 원문 그대로 인용하고 요약하지 않는다)

import type { SearchResultItem } from "./search";
import type { ManualResult } from "./paste";

export type ExportEntry = {
  item: SearchResultItem;
  /** 담당자가 직접 붙여넣은 스크립트로 확인한 결과가 있으면 */
  manual?: ManualResult;
};

export type ExportMeta = {
  keywords: string[];
  generatedAt: Date;
  /** 전체 결과 중 이 파일이 몇 번째 묶음인지 (화면 내려받기에는 없음) */
  part?: { number: number; count: number; size: number; total: number };
  /** 전체 건수 (구역별) */
  totals?: { main: number; unverified: number; small: number };
};

const SECTION_TITLE: Record<SearchResultItem["section"], string> = {
  main: "24개 주요 채널 · 자막에서 찾음",
  unverified: "확인불가 · 언급 가능성 높음 (자막을 받지 못한 24개 채널 영상)",
  small: "그 밖의 채널 · 제목·태그·설명에서 찾음",
};

const seoulDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "2026. 11. 01. 17:15" → "2026-11-01 17:15" (한국 시간) */
export function formatKoreanDateTime(value: Date | string): string {
  const parts = Object.fromEntries(seoulDate.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/** 123초 → "2:03", 3723초 → "1:02:03" */
function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const LINE = "=".repeat(70);
const THIN = "-".repeat(70);

function mentionLines(
  mentions: { text: string; seconds: number | null; url: string | null }[],
  moreMentions: number,
  videoUrl: string,
): string[] {
  const lines: string[] = [];
  for (const mention of mentions) {
    const label = mention.seconds === null ? "(시간 정보 없음)" : clock(mention.seconds);
    lines.push(`   · ${label}${mention.url ? `  ${mention.url}` : ""}`);
    // 구절은 줄바꿈 없이 한 덩어리로 넣는다. 자막 원문이므로 따옴표로 감싸고 고치지 않는다.
    lines.push(`     "${mention.text.replace(/\s+/g, " ").trim()}"`);
  }
  if (moreMentions > 0) lines.push(`   외 ${moreMentions}곳 더 있음 → ${videoUrl}`);
  return lines;
}

function entryLines(number: number, entry: ExportEntry): string[] {
  const { item, manual } = entry;
  const lines = [
    `${number}. ${item.videoTitle}`,
    `   채널: ${item.channelName}`,
    `   게시: ${formatKoreanDateTime(item.uploadedAt)} (한국 시간)${item.isShort ? " · 쇼츠" : ""}`,
    `   링크: ${item.videoUrl}`,
  ];

  if (manual) {
    lines.push("   확인 방식: 담당자가 직접 붙여넣은 스크립트");
    if (manual.mentions.length > 0) {
      lines.push(`   찾은 키워드: ${manual.matchedKeywords.join(", ")}`);
      lines.push(`   언급 (붙여넣은 스크립트 원문${manual.mode === "timed" ? " / 시점 링크" : ", 시간 정보 없음"}):`);
      lines.push(...mentionLines(manual.mentions, manual.moreMentions, item.videoUrl));
    } else {
      lines.push("   언급: 붙여넣은 스크립트에서 키워드를 찾지 못함 (언급 없음)");
    }
  } else if (item.matchType === "transcript") {
    lines.push("   확인 방식: 자막(자동 자막 기준, 오인식이 있을 수 있음)");
    lines.push(`   찾은 키워드: ${item.matchedKeywords.join(", ")}`);
    lines.push("   언급 (자막 원문 / 시점 링크):");
    lines.push(...mentionLines(item.mentions, item.moreMentions, item.videoUrl));
  } else {
    lines.push(`   확인 방식: ${item.matchedIn.join("·")}에서 찾음 (영상 속 발언은 확인하지 못함 — 링크로 직접 확인 필요)`);
    lines.push(`   찾은 키워드: ${item.matchedKeywords.join(", ")}`);
  }
  return lines;
}

/** 결과 목록을 txt 내용으로 만든다. (파일 맨 앞 BOM은 내려받을 때 붙인다) */
export function formatExport(entries: ExportEntry[], meta: ExportMeta): string {
  const header = [
    "경제 유튜브 여론 모니터 — 키워드 언급 결과",
    `검색 키워드: ${meta.keywords.join(", ")}`,
    `내려받은 시각: ${formatKoreanDateTime(meta.generatedAt)} (한국 시간)`,
    "조회 범위: 최근 14일에 올라온 영상",
  ];
  if (meta.totals) {
    header.push(`전체 결과: 24개 주요 채널 ${meta.totals.main}건 · 확인불가 ${meta.totals.unverified}건 · 그 밖의 채널 ${meta.totals.small}건`);
  }
  if (meta.part) {
    const from = (meta.part.number - 1) * meta.part.size + 1;
    const to = Math.min(meta.part.number * meta.part.size, meta.part.total);
    header.push(`이 파일: 전체 ${meta.part.total}건 중 ${from}~${to}번째 (${meta.part.number}/${meta.part.count} 묶음)`);
  }
  header.push(`이 파일에 담긴 영상: ${entries.length}건`);
  header.push(
    "※ 언급 '내용'은 요약이 아니라 자막 원문(키워드 앞뒤 약 15초)입니다. 자동 자막은 경제 용어를 잘못 받아 적을 수 있으니 중요한 내용은 링크로 원본을 확인해 주세요.",
  );

  const out: string[] = [...header, ""];
  let number = 0;
  let lastSection: SearchResultItem["section"] | null = null;
  for (const entry of entries) {
    if (entry.item.section !== lastSection) {
      lastSection = entry.item.section;
      out.push(LINE, `[${SECTION_TITLE[lastSection]}]`, THIN);
    }
    number++;
    out.push(...entryLines(number, entry), "");
  }
  if (entries.length === 0) out.push("(조건에 맞는 영상이 없습니다.)");
  return out.join("\r\n") + "\r\n";
}

/** 파일 이름에 쓸 수 없는 글자를 뺀 이름. 예: 언급결과_금리-환율_2026-11-02.txt */
export function exportFileName(keywords: string[], generatedAt: Date, part?: number): string {
  const label = keywords
    .slice(0, 3)
    .join("-")
    .replace(/[\\/:*?"<>|\s]+/g, "")
    .slice(0, 30);
  const more = keywords.length > 3 ? `외${keywords.length - 3}` : "";
  const date = formatKoreanDateTime(generatedAt).slice(0, 10);
  return `언급결과_${label || "키워드"}${more}_${date}${part ? `_${part}` : ""}.txt`;
}
