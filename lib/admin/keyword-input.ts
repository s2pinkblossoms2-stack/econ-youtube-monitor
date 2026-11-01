// Design Ref: §4.1, 보안 점검 SEC-002 — 저장할 키워드 입력 검사.

import { MAX_KEYWORD_LENGTH } from "../search/validate";

/**
 * 저장해 두는 키워드의 최대 개수. 저장한 키워드는 수집 때마다 유튜브 검색(키워드당 약 200단위)에 쓰이므로,
 * 하루 한도(10,000단위) 안에 들어오도록 정한 상한이다. (30개 × 200 = 6,000단위)
 */
export const MAX_SAVED_KEYWORDS = 30;

/** 저장할 키워드를 검사해 앞뒤 공백을 뺀 값을 돌려준다. 비었거나 너무 길거나 쓸 수 없는 글자가 있으면 null이다. */
export function parseKeywordText(input: string): string | null {
  const text = input.trim();
  if (text.length === 0 || text.length > MAX_KEYWORD_LENGTH) return null;
  // 쉼표는 키워드를 나누는 글자이고, *는 검색에서 받지 않는다. 제어 문자도 받지 않는다.
  if (/[,*\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}
