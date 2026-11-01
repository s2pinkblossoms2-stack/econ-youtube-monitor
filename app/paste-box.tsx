"use client";

// 자막을 받지 못한 영상(확인불가·그 밖의 채널) 카드 안의 "스크립트 직접 붙여넣기" 칸.
// 담당자가 유튜브에서 복사한 스크립트를 붙여넣으면 브라우저 안에서 키워드를 찾아 보여준다. 서버로 보내거나 저장하지 않는다.

import { useState } from "react";
import { ClipboardPaste, X } from "lucide-react";
import { analyzePastedTranscript, MAX_PASTE_LENGTH, type ManualResult } from "@/lib/search/paste";
import { formatSeconds } from "./format";
import { Highlight } from "./highlight";

export function PasteBox({
  videoId,
  keywords,
  result,
  onResult,
}: {
  videoId: string;
  keywords: string[];
  result: ManualResult | undefined;
  onResult: (result: ManualResult | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function analyze() {
    if (text.trim().length === 0) {
      setError("붙여넣은 내용이 없습니다. 유튜브에서 복사한 스크립트를 붙여넣어 주세요.");
      return;
    }
    if (text.length > MAX_PASTE_LENGTH) {
      setError(`내용이 너무 깁니다. ${MAX_PASTE_LENGTH.toLocaleString("ko-KR")}자 이하로 붙여넣어 주세요.`);
      return;
    }
    setError(null);
    onResult(analyzePastedTranscript(videoId, text, keywords));
    setOpen(false);
  }

  return (
    <div className="mt-4 border-t border-gray-10 pt-4">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-primary-60 px-3.5 py-2 text-sm font-medium text-primary-60 hover:bg-primary-5"
        >
          <ClipboardPaste className="h-4 w-4" />
          {result ? "스크립트 다시 붙여넣기" : "스크립트 직접 붙여넣기"}
        </button>
      )}

      {open && (
        <div className="space-y-2">
          <p className="text-sm text-gray-70">
            유튜브 영상 아래의 <strong>더보기(…) → 스크립트 표시</strong>에서 전체를 복사해 붙여넣으세요. 시간이 함께 복사되면 언급 시점 링크도 만들어
            드립니다. 붙여넣은 내용은 이 브라우저 안에서만 처리하고 서버에 저장하지 않습니다.
          </p>
          <label htmlFor={`paste-${videoId}`} className="sr-only">
            붙여넣을 스크립트
          </label>
          <textarea
            id={`paste-${videoId}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            placeholder={"0:00\n안녕하세요 오늘은…\n0:03\n…"}
            className="w-full rounded-lg border border-gray-30 bg-white px-3 py-2 text-sm"
          />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={analyze}
              className="rounded-lg bg-primary-60 px-4 py-2 text-sm font-medium text-white hover:bg-primary-70"
            >
              이 스크립트에서 키워드 찾기
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-lg border border-gray-30 px-4 py-2 text-sm text-gray-80 hover:border-primary-50"
            >
              닫기
            </button>
            <span className="text-xs text-gray-50">{text.length.toLocaleString("ko-KR")}자</span>
          </div>
        </div>
      )}

      {result && !open && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-primary-50 bg-primary-5 px-2 py-0.5 text-xs font-medium text-primary-70">
              직접 붙여넣은 스크립트 기준
            </span>
            <span className="text-sm font-medium text-primary-90">
              {result.mentions.length > 0
                ? `${result.mentions.length + result.moreMentions}곳에서 찾음 (${result.matchedKeywords.join(", ")})`
                : "키워드를 찾지 못함 → 언급 없음"}
            </span>
            <button
              type="button"
              onClick={() => onResult(null)}
              className="ml-auto flex items-center gap-1 text-xs text-gray-50 hover:text-red-600"
              aria-label="붙여넣은 결과 지우기"
            >
              <X className="h-3.5 w-3.5" />
              지우기
            </button>
          </div>

          {result.mentions.length > 0 && (
            <ul className="mt-2 space-y-3">
              {result.mentions.map((mention, index) => (
                <li key={`${mention.seconds ?? "x"}-${index}`} className="rounded-lg bg-secondary-5 p-4 text-sm leading-relaxed text-gray-80">
                  <p className="mb-1.5 text-xs text-gray-50">
                    {mention.url && mention.seconds !== null ? (
                      <a
                        href={mention.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-primary-60 underline decoration-gray-30 underline-offset-2 hover:decoration-primary-60"
                      >
                        ▶ {formatSeconds(mention.seconds)}부터 보기
                      </a>
                    ) : (
                      "시간 정보 없음 (스크립트에 시간이 없어 시점 링크를 만들 수 없습니다)"
                    )}
                  </p>
                  <p>
                    <Highlight text={mention.text} keywords={keywords} />
                  </p>
                </li>
              ))}
            </ul>
          )}
          {result.moreMentions > 0 && <p className="mt-2 text-sm text-gray-70">외 {result.moreMentions}곳 더 있음</p>}
        </div>
      )}
    </div>
  );
}
