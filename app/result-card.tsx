// 검색 결과 한 건(영상 하나). 모든 결과에는 영상 링크가, 모든 언급 구절에는 시점 링크가 붙는다.
// 공식 홈페이지의 목록처럼 파란 테두리의 작은 분류 표시, 굵은 제목, 오른쪽의 날짜로 구성한다.

import type { ManualResult } from "@/lib/search/paste";
import type { SearchResultItem } from "@/lib/search/search";
import { formatSeconds, formatUploadedAt } from "./format";
import { Highlight } from "./highlight";
import { PasteBox } from "./paste-box";

const linkClass = "underline decoration-gray-30 underline-offset-2 hover:decoration-primary-60 hover:text-primary-60";
const tagClass = "rounded border border-gray-30 px-2 py-0.5 text-xs text-gray-70";

export function ResultCard({
  item,
  searchedKeywords,
  manual,
  onManual,
}: {
  item: SearchResultItem;
  searchedKeywords: string[];
  /** 담당자가 직접 붙여넣은 스크립트로 확인한 결과 */
  manual?: ManualResult;
  onManual?: (videoId: string, result: ManualResult | null) => void;
}) {
  return (
    <li className="rounded-xl border border-gray-20 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-primary-50 px-2 py-0.5 text-xs font-medium text-primary-60">{item.channelName}</span>
        {item.isShort && <span className={tagClass}>쇼츠</span>}
        {item.matchType === "metadata" && <span className={tagClass}>{item.matchedIn.join("·")}에서 찾음</span>}
        {item.captionStatus === "none" && <span className={tagClass}>자막 확인불가</span>}
        <span className="ml-auto text-sm text-gray-50">{formatUploadedAt(item.uploadedAt)}</span>
      </div>

      <h3 className="mt-2 text-lg font-semibold leading-snug text-foreground">
        <a href={item.videoUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {item.videoTitle}
        </a>
      </h3>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.matchedKeywords.map((keyword) => (
          <span key={keyword} className="rounded-full bg-primary-5 px-2.5 py-0.5 text-xs font-medium text-primary-70">
            {keyword}
          </span>
        ))}
      </div>

      {item.matchType === "metadata" && (
        <a href={item.videoUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block w-full max-w-xs">
          {/* 썸네일 주소는 서버가 영상 ID로 만든 유튜브 주소다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.thumbnailUrl}
            alt={`${item.videoTitle} 썸네일`}
            loading="lazy"
            className="aspect-video w-full rounded-lg border border-gray-20 object-cover"
          />
        </a>
      )}

      <ul className="mt-3 space-y-3">
        {item.mentions.map((mention) => (
          <li key={mention.seconds} className="rounded-lg bg-secondary-5 p-4 text-sm leading-relaxed text-gray-80">
            <p className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-50">
              <a href={mention.url} target="_blank" rel="noopener noreferrer" className={`${linkClass} font-semibold text-primary-60`}>
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
        <p className="mt-2 text-sm text-gray-70">
          외 {item.moreMentions}건 —{" "}
          <a href={item.videoUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            영상에서 확인
          </a>
        </p>
      )}

      {/* 자막을 받지 못한 영상은 담당자가 스크립트를 직접 붙여넣어 확인할 수 있다 */}
      {item.captionStatus === "none" && onManual && (
        <PasteBox
          videoId={item.videoId}
          keywords={searchedKeywords}
          result={manual}
          onResult={(result) => onManual(item.videoId, result)}
        />
      )}
    </li>
  );
}

