// Design Ref: §4.2 — 영상 링크와 시점 링크. 저장된 주소를 쓰지 않고 영상 ID로 직접 조립한다. (보안 점검 SEC-008)
// 영상 ID가 유튜브 형식(11자)이 아니면 링크를 만들지 않고 오류를 던진다. (PRD: 링크 없는 결과는 보여주지 않는다)

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** 영상 링크. seconds를 주면 그 시점(초)으로 바로 이동하는 링크가 된다. */
export function videoUrl(videoId: string, seconds?: number): string {
  if (!VIDEO_ID_PATTERN.test(videoId)) throw new Error("영상 ID 형식이 올바르지 않습니다.");
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  return seconds === undefined ? base : `${base}&t=${Math.max(0, Math.floor(seconds))}s`;
}
