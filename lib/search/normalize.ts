// Design Ref: §3 — 검색용 글자 정리. 띄어쓰기 차이를 없애기 위해 모든 공백을 지우고 소문자로 바꾼다.
// 자막을 저장할 때(normalized_text)와 키워드를 찾을 때 같은 함수를 써야 결과가 어긋나지 않는다.

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}
