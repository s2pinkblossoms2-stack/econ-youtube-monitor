// 검색 결과 한 건(영상 하나). 모든 결과에는 영상 링크가, 모든 언급 구절에는 시점 링크가 붙는다.

import type { SearchResultItem } from "@/lib/search/search";
import { formatSeconds, formatUploadedAt } from "./format";

const linkClass = "underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground";

export function ResultCard({ item, searchedKeywords }: { item: SearchResultItem; searchedKeywords: string[] }) {
  return (
    <li className="rounded-lg border border-foreground/15 p-4">
      <p className="text-sm text-foreground/70">
        {item.channelName} · {formatUploadedAt(item.uploadedAt)}
      </p>
      <h3 className="mt-1 text-base font-semibold leading-snug">
        <a href={item.videoUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {item.videoTitle}
        </a>
      </h3>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.matchedKeywords.map((keyword) => (
          <span key={keyword} className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium">
            {keyword}
          </span>
        ))}
        {item.isShort && <span className="rounded-full border border-foreground/30 px-2 py-0.5 text-xs">쇼츠</span>}
        {item.matchType === "metadata" && (
          <span className="rounded-full border border-foreground/30 px-2 py-0.5 text-xs">
            {item.matchedIn.join("·")}에서 찾음
          </span>
        )}
        {item.captionStatus === "none" && (
          <span className="rounded-full border border-foreground/30 px-2 py-0.5 text-xs">자막 확인 안 함</span>
        )}
      </div>

      {item.matchType === "metadata" && (
        <a href={item.videoUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block w-full max-w-xs">
          {/* 썸네일 주소는 서버가 영상 ID로 만든 유튜브 주소다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.thumbnailUrl}
            alt={`${item.videoTitle} 썸네일`}
            loading="lazy"
            className="aspect-video w-full rounded-md border border-foreground/15 object-cover"
          />
        </a>
      )}

      <ul className="mt-3 space-y-3">
        {item.mentions.map((mention) => (
          <li key={mention.seconds} className="rounded-md bg-foreground/5 p-3 text-sm leading-relaxed">
            <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-foreground/70">
              <a href={mention.url} target="_blank" rel="noopener noreferrer" className={`${linkClass} font-medium`}>
                ▶ {formatSeconds(mention.seconds)}부터 보기
              </a>
              <span>자동 자막 기준 · 오인식이 있을 수 있어요</span>
            </p>
            <p>
              <Highlight text={mention.text} keywords={searchedKeywords} />
            </p>
          </li>
        ))}
      </ul>
      {item.moreMentions > 0 && (
        <p className="mt-2 text-sm text-foreground/70">
          외 {item.moreMentions}건 —{" "}
          <a href={item.videoUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            영상에서 확인
          </a>
        </p>
      )}
    </li>
  );
}

// 입력한 키워드를 구절 안에서 표시한다. 글자를 쪼개 <mark>로 감쌀 뿐이고 HTML로 해석하지 않는다.
function Highlight({ text, keywords }: { text: string; keywords: string[] }) {
  const escaped = keywords.filter((keyword) => keyword.length > 0).map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded bg-yellow-300/70 px-0.5 text-inherit dark:bg-yellow-400/40">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
