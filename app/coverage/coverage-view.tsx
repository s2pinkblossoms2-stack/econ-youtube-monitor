"use client";

// 채널별 수집 현황 표와, 채널을 펼치면 보이는 영상별 자막 확인 상태. /api/coverage만 부른다.

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatUploadedAt } from "../format";

type Channel = {
  id: number;
  name: string;
  lastCheckedAt: string | null;
  total: number;
  ok: number;
  none: number;
  pending: number;
};

type Status = "ok" | "none" | "pending";
type Video = { videoId: string; title: string; uploadedAt: string; status: Status; isShort: boolean; url: string };

const STATUS_LABEL: Record<Status, string> = {
  ok: "자막 확인 완료",
  none: "확인불가 (자막을 받지 못함)",
  pending: "대기 (아직 확인 전)",
};

const STATUS_STYLE: Record<Status, string> = {
  ok: "border-primary-50 text-primary-60",
  none: "border-red-500 text-red-600",
  pending: "border-gray-30 text-gray-70",
};

export function CoverageView() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/coverage")
      .then(async (response) => ({ ok: response.ok, body: (await response.json().catch(() => null)) as { channels?: Channel[]; error?: string } | null }))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (!ok || !body?.channels) setError(body?.error ?? "수집 현황을 불러오지 못했습니다.");
        else setChannels(body.channels);
      })
      .catch(() => {
        if (alive) setError("서버에 연결하지 못했습니다.");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-red-500/50 bg-red-500/10 p-4">
        {error}
      </p>
    );
  }
  if (!channels) return <p className="text-gray-70">수집 현황을 불러오는 중…</p>;

  const total = channels.reduce((sum, c) => sum + c.total, 0);
  const ok = channels.reduce((sum, c) => sum + c.ok, 0);
  const none = channels.reduce((sum, c) => sum + c.none, 0);
  const pending = channels.reduce((sum, c) => sum + c.pending, 0);
  const percent = total > 0 ? Math.floor((ok / total) * 100) : 0;
  const shown = onlyProblems ? channels.filter((c) => c.none + c.pending > 0) : channels;

  return (
    <div className="space-y-6">
      <section aria-label="전체 요약" className="rounded-xl bg-linear-to-r from-primary-90 via-primary-80 to-primary-60 px-6 py-5 text-white">
        <p className="text-lg font-bold">
          최근 14일 영상 {total.toLocaleString("ko-KR")}개 중 자막을 확인한 영상은 {ok.toLocaleString("ko-KR")}개 ({percent}%)
        </p>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/25" role="presentation">
          <div className="h-full rounded-full bg-white" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-3 text-sm sm:text-base">
          자막 확인 완료 <strong>{ok.toLocaleString("ko-KR")}</strong>개 · 확인불가 <strong>{none.toLocaleString("ko-KR")}</strong>개 · 대기{" "}
          <strong>{pending.toLocaleString("ko-KR")}</strong>개
        </p>
      </section>

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-gray-80">
        <input type="checkbox" checked={onlyProblems} onChange={(event) => setOnlyProblems(event.target.checked)} className="h-4 w-4" />
        확인불가·대기가 있는 채널만 보기 ({channels.filter((c) => c.none + c.pending > 0).length}개 채널)
      </label>

      <ul className="space-y-3">
        {shown.map((channel) => (
          <ChannelRow key={channel.id} channel={channel} />
        ))}
        {shown.length === 0 && <li className="rounded-xl border border-gray-20 bg-white p-5 text-gray-70">해당하는 채널이 없습니다.</li>}
      </ul>
    </div>
  );
}

function ChannelRow({ channel }: { channel: Channel }) {
  const [open, setOpen] = useState(false);
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyNone, setOnlyNone] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && videos === null) {
      try {
        const response = await fetch(`/api/coverage/${channel.id}`);
        const body = (await response.json().catch(() => null)) as { videos?: Video[]; error?: string } | null;
        if (!response.ok || !body?.videos) setError(body?.error ?? "영상 목록을 불러오지 못했습니다.");
        else setVideos(body.videos);
      } catch {
        setError("서버에 연결하지 못했습니다.");
      }
    }
  }

  const problems = channel.none + channel.pending;
  const list = videos ? (onlyNone ? videos.filter((video) => video.status !== "ok") : videos) : [];

  return (
    <li className="rounded-xl border border-gray-20 bg-white">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left sm:p-5"
      >
        {open ? <ChevronDown className="h-5 w-5 shrink-0 text-gray-50" /> : <ChevronRight className="h-5 w-5 shrink-0 text-gray-50" />}
        <span className="min-w-0 flex-1 basis-48 text-lg font-semibold text-primary-90">{channel.name}</span>
        <span className="text-sm text-gray-70">영상 {channel.total}개</span>
        <span className="rounded border border-primary-50 px-2 py-0.5 text-xs font-medium text-primary-60">확인 완료 {channel.ok}</span>
        <span
          className={`rounded border px-2 py-0.5 text-xs font-medium ${channel.none > 0 ? "border-red-500 text-red-600" : "border-gray-30 text-gray-50"}`}
        >
          확인불가 {channel.none}
        </span>
        {channel.pending > 0 && <span className="rounded border border-gray-30 px-2 py-0.5 text-xs text-gray-70">대기 {channel.pending}</span>}
        <span className="w-full text-xs text-gray-50 sm:w-auto">
          {channel.lastCheckedAt ? `마지막 수집 ${formatUploadedAt(channel.lastCheckedAt)}` : "아직 수집 전"}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-10 p-4 sm:p-5">
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {!videos && !error && <p className="text-sm text-gray-50">영상 목록을 불러오는 중…</p>}
          {videos && (
            <>
              {problems > 0 && (
                <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-gray-80">
                  <input type="checkbox" checked={onlyNone} onChange={(event) => setOnlyNone(event.target.checked)} className="h-4 w-4" />
                  확인불가·대기 영상만 보기 ({problems}개)
                </label>
              )}
              {list.length === 0 ? (
                <p className="text-sm text-gray-70">표시할 영상이 없습니다.</p>
              ) : (
                <ul className="divide-y divide-gray-10">
                  {list.map((video) => (
                    <li key={video.videoId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                      <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[video.status]}`}>
                        {STATUS_LABEL[video.status]}
                      </span>
                      {video.isShort && <span className="shrink-0 rounded border border-gray-30 px-2 py-0.5 text-xs text-gray-70">쇼츠</span>}
                      <a
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 basis-64 text-sm text-foreground underline decoration-gray-30 underline-offset-2 hover:text-primary-60"
                      >
                        {video.title}
                      </a>
                      <span className="shrink-0 text-xs text-gray-50">{formatUploadedAt(video.uploadedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
