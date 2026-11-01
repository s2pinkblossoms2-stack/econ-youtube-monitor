// 입력한 키워드를 구절 안에서 표시한다. 글자를 쪼개 <mark>로 감쌀 뿐이고 HTML로 해석하지 않는다.
// 자막 구절과, 담당자가 붙여넣은 스크립트 구절이 같이 쓴다.

export function Highlight({ text, keywords }: { text: string; keywords: string[] }) {
  const escaped = keywords.filter((keyword) => keyword.length > 0).map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded bg-yellow-200 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
