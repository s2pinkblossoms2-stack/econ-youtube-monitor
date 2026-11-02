// Design Ref: §4.2, §7 — 검색 입력 검사. 사용자가 보낸 값은 믿지 않고 길이·개수·형식을 서버에서 확인한다. (보안 점검 SEC-005)

export const MAX_KEYWORDS = 30;
export const MAX_KEYWORD_LENGTH = 50;
export const MAX_PAGE = 50;
export const PAGE_SIZE = 20;
/** 내려받기 한 파일에 담는 영상 수. 영상마다 자막 원본을 읽어야 해서 300개씩 나눠 내려받게 한다. */
export const EXPORT_PART_SIZE = 300;
// 쉼표로 나누기 전의 전체 길이 상한 (아주 긴 값을 쪼개는 일부터 막는다)
const MAX_RAW_LENGTH = 2000;

export type SearchInput = { keywords: string[]; page: number };

export type ParseResult = { ok: true; value: SearchInput } | { ok: false; message: string };

/** `?keywords=금리,환율&page=1`을 검사해 돌려준다. 잘못된 값은 이유를 한국어로 돌려준다. */
export function parseSearchParams(params: URLSearchParams): ParseResult {
  const raw = params.get("keywords") ?? "";
  if (raw.length > MAX_RAW_LENGTH) return fail("키워드가 너무 깁니다.");

  const keywords: string[] = [];
  const seen = new Set<string>();
  for (const piece of raw.split(",")) {
    const keyword = piece.trim();
    if (keyword.length === 0) continue;
    if (keyword.length > MAX_KEYWORD_LENGTH) return fail(`키워드는 ${MAX_KEYWORD_LENGTH}자까지 입력할 수 있습니다.`);
    // 저장소의 글자 찾기에서 *는 와일드카드로 해석되므로 받지 않는다.
    if (keyword.includes("*")) return fail("키워드에 * 문자는 쓸 수 없습니다.");
    const key = keyword.replace(/\s+/g, "").toLowerCase();
    if (seen.has(key)) continue; // 띄어쓰기·대소문자만 다른 같은 키워드는 한 번만
    seen.add(key);
    keywords.push(keyword);
  }
  if (keywords.length === 0) return fail("키워드를 한 개 이상 입력해 주세요.");
  if (keywords.length > MAX_KEYWORDS) return fail(`키워드는 ${MAX_KEYWORDS}개까지 입력할 수 있습니다.`);

  const pageRaw = params.get("page");
  let page = 1;
  if (pageRaw !== null) {
    if (!/^\d{1,3}$/.test(pageRaw)) return fail("쪽 번호가 올바르지 않습니다.");
    page = Number(pageRaw);
    if (page < 1 || page > MAX_PAGE) return fail(`쪽 번호는 1~${MAX_PAGE}이어야 합니다.`);
  }

  return { ok: true, value: { keywords, page } };
}

/** 내려받기 묶음 번호의 상한. 300개씩이라 최대 6,000건까지 받을 수 있다. */
export const MAX_EXPORT_PART = 20;

/** 내려받을 구역. all은 세 구역 전부 */
export type ExportSection = "all" | "main" | "unverified" | "small";
const EXPORT_SECTIONS: ExportSection[] = ["all", "main", "unverified", "small"];

export type ExportInput = { keywords: string[]; part: number; section: ExportSection; format: "txt" | "json" };
export type ExportParseResult = { ok: true; value: ExportInput } | { ok: false; message: string };

/** `?keywords=금리,환율&part=1`을 검사한다. 키워드 규칙은 검색과 같다. */
export function parseExportParams(params: URLSearchParams): ExportParseResult {
  const search = new URLSearchParams();
  search.set("keywords", params.get("keywords") ?? "");
  const parsed = parseSearchParams(search);
  if (!parsed.ok) return parsed;

  const partRaw = params.get("part");
  let part = 1;
  if (partRaw !== null) {
    if (!/^\d{1,2}$/.test(partRaw)) return { ok: false, message: "묶음 번호가 올바르지 않습니다." };
    part = Number(partRaw);
    if (part < 1 || part > MAX_EXPORT_PART) return { ok: false, message: `묶음 번호는 1~${MAX_EXPORT_PART}이어야 합니다.` };
  }
  const sectionRaw = params.get("section") ?? "all";
  if (!EXPORT_SECTIONS.includes(sectionRaw as ExportSection)) return { ok: false, message: "구역 값이 올바르지 않습니다." };
  const formatRaw = params.get("format") ?? "txt";
  if (formatRaw !== "txt" && formatRaw !== "json") return { ok: false, message: "형식 값이 올바르지 않습니다." };
  return { ok: true, value: { keywords: parsed.value.keywords, part, section: sectionRaw as ExportSection, format: formatRaw } };
}

function fail(message: string): ParseResult {
  return { ok: false, message };
}
