"use client";

// 저장한 키워드 불러오기·저장·삭제. 키워드 목록은 비밀번호로 막혀 있어서, 이 영역을 눌렀을 때만 서버에서 불러온다.
// (검색 화면을 열자마자 비밀번호 창이 뜨지 않게)

import { useState } from "react";

type SavedKeyword = { id: number; text: string; last_collected_at: string | null };

type Message = { kind: "ok" | "error"; text: string } | null;

function errorText(body: unknown, status: number, fallback: string): string {
  if (status === 401) return "비밀번호가 필요합니다. 비밀번호 창에 입력한 뒤 다시 눌러 주세요.";
  if (typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return fallback;
}

export function SavedKeywords({ input, onPick }: { input: string; onPick: (keyword: string) => void }) {
  const [open, setOpen] = useState(false);
  const [keywords, setKeywords] = useState<SavedKeyword[] | null>(null);
  const [max, setMax] = useState(30);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function load(): Promise<boolean> {
    try {
      const response = await fetch("/api/keywords");
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ kind: "error", text: errorText(body, response.status, "저장한 키워드를 불러오지 못했습니다.") });
        return false;
      }
      const data = body as { keywords: SavedKeyword[]; max: number };
      setKeywords(data.keywords);
      setMax(data.max);
      return true;
    } catch {
      setMessage({ kind: "error", text: "서버에 연결하지 못했습니다." });
      return false;
    }
  }

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setMessage(null);
    const ok = await load();
    setBusy(false);
    setOpen(ok);
  }

  async function saveCurrent() {
    const wanted = input
      .split(",")
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0);
    if (wanted.length === 0) return;
    setBusy(true);
    setMessage(null);
    const problems: string[] = [];
    let saved = 0;
    for (const text of wanted) {
      try {
        const response = await fetch("/api/keywords", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const body: unknown = await response.json().catch(() => null);
        if (response.ok) saved++;
        else problems.push(`"${text}": ${errorText(body, response.status, "저장하지 못했습니다.")}`);
      } catch {
        problems.push(`"${text}": 서버에 연결하지 못했습니다.`);
      }
    }
    await load();
    setBusy(false);
    if (problems.length > 0) {
      setMessage({ kind: "error", text: `${saved}개 저장, 못 저장한 키워드 — ${problems.join(" / ")}` });
    } else {
      setMessage({ kind: "ok", text: `${saved}개를 저장했습니다. 다음 수집부터 그 밖의 채널 영상도 찾습니다.` });
    }
  }

  async function remove(keyword: SavedKeyword) {
    if (!window.confirm(`"${keyword.text}"을(를) 저장 목록에서 지울까요? 이미 모은 영상은 그대로 남습니다.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/keywords/${keyword.id}`, { method: "DELETE" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ kind: "error", text: errorText(body, response.status, "지우지 못했습니다.") });
      } else {
        setMessage({ kind: "ok", text: `"${keyword.text}"을(를) 지웠습니다.` });
        await load();
      }
    } catch {
      setMessage({ kind: "error", text: "서버에 연결하지 못했습니다." });
    }
    setBusy(false);
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-expanded={open}
        className="rounded-lg border border-foreground/30 px-3 py-1.5 text-sm disabled:opacity-40"
      >
        {open ? "저장한 키워드 닫기" : "저장한 키워드 불러오기"}
      </button>

      <div aria-live="polite">
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`mt-2 rounded-lg border p-3 text-sm ${
              message.kind === "error" ? "border-red-500/50 bg-red-500/10" : "border-green-600/50 bg-green-600/10"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      {open && keywords && (
        <div className="mt-3 rounded-lg border border-foreground/15 p-3">
          {keywords.length === 0 ? (
            <p className="text-sm text-foreground/70">저장한 키워드가 없습니다.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <li key={keyword.id} className="flex items-center rounded-full border border-foreground/30 text-sm">
                  <button type="button" onClick={() => onPick(keyword.text)} className="rounded-l-full px-3 py-1" title="검색창에 넣기">
                    {keyword.text}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(keyword)}
                    disabled={busy}
                    aria-label={`${keyword.text} 지우기`}
                    className="rounded-r-full px-2 py-1 text-foreground/60 disabled:opacity-40"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void saveCurrent()}
              disabled={busy || input.trim().length === 0}
              className="rounded-lg bg-primary-60 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-70 disabled:opacity-40"
            >
              지금 입력한 키워드 저장
            </button>
            <span className="text-xs text-foreground/70">
              {keywords.length}/{max}개 · 저장한 키워드는 수집(<code>npm run collect</code>) 때 유튜브에서 그 밖의 채널 영상을 찾는 데 쓰입니다.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
