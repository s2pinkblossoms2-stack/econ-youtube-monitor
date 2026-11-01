// Design Ref: §4.2, §7 — 검색 입력 검사. 사용자가 보낸 값은 믿지 않고 길이·개수·형식을 서버에서 확인한다. (보안 점검 SEC-005)

export const MAX_KEYWORDS = 30;
export const MAX_KEYWORD_LENGTH = 50;
export const MAX_PAGE = 50;
export const PAGE_SIZE = 20;
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

function fail(message: string): ParseResult {
  return { ok: false, message };
}
