// Design Ref: §9 — 영상 하나의 한국어 자막(자동 자막 포함)을 가져온다. 유튜브 접속은 수집 스크립트에서만 쓴다.
// 비공식 방식(youtube-transcript)이라 막히거나 형식이 바뀔 수 있다. 실패 종류를 나눠서 돌려준다.

import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";

export type TranscriptSegment = {
  /** 시작 시점 (초) */
  start: number;
  text: string;
};

export type TranscriptResult =
  | { status: "ok"; segments: TranscriptSegment[] }
  /** 자막이 없거나 영상을 볼 수 없다. 나중에 자막이 생길 수 있어 상황에 따라 다시 확인한다. */
  | { status: "none" };

/**
 * 한국어 자막을 가져온다. 자막이 없는 경우는 { status: "none" }으로 돌려준다.
 * 접속 차단·한도 초과·네트워크 문제처럼 일시적일 수 있는 실패는 오류로 던진다. (저장하지 않고 다음에 다시 시도)
 */
export async function fetchKoreanTranscript(videoId: string): Promise<TranscriptResult> {
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: "ko" });
    const segments = items
      .map((item) => ({ start: item.offset / 1000, text: item.text.trim() }))
      .filter((segment) => segment.text.length > 0);
    return segments.length > 0 ? { status: "ok", segments } : { status: "none" };
  } catch (e) {
    if (
      e instanceof YoutubeTranscriptDisabledError ||
      e instanceof YoutubeTranscriptNotAvailableError ||
      e instanceof YoutubeTranscriptNotAvailableLanguageError ||
      e instanceof YoutubeTranscriptVideoUnavailableError
    ) {
      return { status: "none" };
    }
    throw e;
  }
}
