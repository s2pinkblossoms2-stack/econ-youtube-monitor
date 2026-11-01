"use client";

// 24개 주요 채널 목록, 추가 입력, 켜기·끄기. 서버의 /api/channels만 부른다. (비밀번호는 브라우저의 로그인 창이 받는다)

import { useEffect, useState, type FormEvent } from "react";
import { formatUploadedAt } from "../format";

type Channel = {
  id: number;
  youtube_channel_id: string;
  name: string;
  active: boolean;
  last_checked_at: string | null;
};

type Message = { kind: "ok" | "error"; text: string } | null;

function errorText(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return fallback;
}

export function ChannelManager() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [maxActive, setMaxActive] = useState(50);
  const [channelInput, setChannelInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  // 목록을 다시 불러오고 싶을 때 이 번호를 올린다.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/channels")
      .then(async (response) => ({ ok: response.ok, body: (await response.json().catch(() => null)) as unknown }))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (!ok) {
          setMessage({ kind: "error", text: errorText(body, "채널 목록을 불러오지 못했습니다.") });
          return;
        }
        const data = body as { channels: Channel[]; maxActive: number };
        setChannels(data.channels);
        setMaxActive(data.maxActive);
      })
      .catch(() => {
        if (alive) setMessage({ kind: "error", text: "서버에 연결하지 못했습니다." });
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  async function send(url: string, method: "POST" | "PATCH", payload: object, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ kind: "error", text: errorText(body, "요청을 처리하지 못했습니다.") });
        return false;
      }
      setMessage({ kind: "ok", text: success });
      setReloadKey((key) => key + 1);
      return true;
    } catch {
      setMessage({ kind: "error", text: "서버에 연결하지 못했습니다." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const done = await send("/api/channels", "POST", { channel: channelInput, name: nameInput }, "채널을 추가했습니다. 다음 수집부터 영상을 모읍니다.");
    if (done) {
      setChannelInput("");
      setNameInput("");
    }
  }

  const activeCount = channels?.filter((channel) => channel.active).length ?? 0;

  return (
    <div className="space-y-8">
      <form onSubmit={onAdd} className="space-y-3 rounded-xl border border-gray-20 bg-white p-5">
        <h2 className="border-l-4 border-primary-60 pl-3 text-xl font-bold text-primary-90">채널 추가</h2>
        <div>
          <label htmlFor="channel" className="mb-1 block text-sm font-medium">
            채널 ID 또는 채널 주소
          </label>
          <input
            id="channel"
            value={channelInput}
            onChange={(event) => setChannelInput(event.target.value)}
            placeholder="UC로 시작하는 채널 ID, 또는 youtube.com/channel/UC… 주소"
            className="w-full rounded-lg border border-gray-30 bg-white px-3 py-2"
            maxLength={200}
          />
          <p className="mt-1 text-xs text-gray-70">@이름 형태의 주소는 쓸 수 없습니다. 채널 페이지의 &lsquo;정보&rsquo;에서 채널 ID를 복사하세요.</p>
        </div>
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">
            채널 이름
          </label>
          <input
            id="name"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="결과에 표시될 이름"
            className="w-full rounded-lg border border-gray-30 bg-white px-3 py-2"
            maxLength={50}
          />
        </div>
        <button
          type="submit"
          disabled={busy || channelInput.trim().length === 0 || nameInput.trim().length === 0}
          className="rounded-lg bg-primary-60 px-5 py-2 font-medium text-white hover:bg-primary-70 disabled:opacity-40"
        >
          {busy ? "처리 중…" : "추가"}
        </button>
      </form>

      <div aria-live="polite">
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`rounded-lg border p-3 text-sm ${
              message.kind === "error" ? "border-red-500/50 bg-red-500/10" : "border-green-600/50 bg-green-600/10"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      <section>
        <h2 className="mb-3 border-l-4 border-primary-60 pl-3 text-xl font-bold text-primary-90">
          주요 채널 <span className="font-normal text-gray-70">· 사용 중 {activeCount}개 (최대 {maxActive}개)</span>
        </h2>
        {channels === null ? (
          <p className="text-gray-70">불러오는 중…</p>
        ) : channels.length === 0 ? (
          <p className="text-gray-70">등록된 채널이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-10 rounded-xl border border-gray-20 bg-white">
            {channels.map((channel) => (
              <li key={channel.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className={`truncate font-medium ${channel.active ? "" : "text-gray-50 line-through"}`}>{channel.name}</p>
                  <p className="truncate text-xs text-gray-70">
                    {channel.youtube_channel_id} ·{" "}
                    {channel.last_checked_at ? `마지막 수집 ${formatUploadedAt(channel.last_checked_at)}` : "아직 수집 전"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void send(
                      `/api/channels/${channel.id}`,
                      "PATCH",
                      { active: !channel.active },
                      channel.active ? `"${channel.name}"을(를) 껐습니다. 영상·자막은 남아 있고 검색에서만 빠집니다.` : `"${channel.name}"을(를) 켰습니다.`,
                    )
                  }
                  className="shrink-0 rounded-lg border border-gray-30 px-3 py-1.5 text-sm hover:border-primary-50 disabled:opacity-40"
                >
                  {channel.active ? "끄기" : "켜기"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
