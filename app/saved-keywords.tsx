"use client";

// 등록한 키워드 패널. 화면을 열면 바로 목록을 보여주고, 전체를 한 번에 검색하거나 키워드를 추가·삭제한다.
// 키워드 목록은 팀 공용 비밀번호로 보호되므로, 비밀번호를 아직 입력하지 않았으면 잠긴 상태로 보여준다. (보안 점검 SEC-003)

import { useEffect, useState, type FormEvent } from "react";
import { Lock, Plus, Search, X } from "lucide-react";

type SavedKeyword = { id: number; text: string; last_collected_at: string | null };

type LoadState =
  | { status: "loading" }
  | { status: "locked" }
  | { status: "error"; message: string }
  | { status: "ready"; keywords: SavedKeyword[]; max: number };

type Message = { kind: "ok" | "error"; text: string } | null;

function errorText(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return fallback;
}

export function SavedKeywords({
  searching,
  onPick,
  onSearchAll,
}: {
  searching: boolean;
  /** 키워드를 눌렀을 때: 검색창에 더한다 */
  onPick: (keyword: string) => void;
  /** 전체 검색 버튼: 등록한 키워드 전체를 한 번에 검색한다 */
  onSearchAll: (keywords: string[]) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  // 처음 열 때와, 바뀐 뒤(reloadKey가 오를 때) 목록을 다시 읽는다.
  useEffect(() => {
    let alive = true;
    fetch("/api/keywords")
      .then(async (response) => ({ status: response.status, ok: response.ok, body: (await response.json().catch(() => null)) as unknown }))
      .then(({ status, ok, body }) => {
        if (!alive) return;
        if (status === 401) {
          setState({ status: "locked" });
        } else if (!ok) {
          setState({ status: "error", message: errorText(body, "등록한 키워드를 불러오지 못했습니다.") });
        } else {
          const data = body as { keywords: SavedKeyword[]; max: number };
          setState({ status: "ready", keywords: data.keywords, max: data.max });
        }
      })
      .catch(() => {
        if (alive) setState({ status: "error", message: "서버에 연결하지 못했습니다." });
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const wanted = adding
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
        else problems.push(`"${text}": ${errorText(body, "저장하지 못했습니다.")}`);
      } catch {
        problems.push(`"${text}": 서버에 연결하지 못했습니다.`);
      }
    }
    setBusy(false);
    setReloadKey((key) => key + 1);
    if (saved > 0) setAdding("");
    if (problems.length > 0) setMessage({ kind: "error", text: `${saved}개 등록, 못 등록한 키워드 — ${problems.join(" / ")}` });
    else setMessage({ kind: "ok", text: `${saved}개를 등록했습니다. 다음 수집부터 그 밖의 채널 영상도 찾습니다.` });
  }

  async function remove(keyword: SavedKeyword) {
    if (!window.confirm(`"${keyword.text}"을(를) 등록 목록에서 지울까요? 이미 모은 영상은 그대로 남습니다.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/keywords/${keyword.id}`, { method: "DELETE" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) setMessage({ kind: "error", text: errorText(body, "지우지 못했습니다.") });
      else setMessage({ kind: "ok", text: `"${keyword.text}"을(를) 지웠습니다.` });
    } catch {
      setMessage({ kind: "error", text: "서버에 연결하지 못했습니다." });
    }
    setBusy(false);
    setReloadKey((key) => key + 1);
  }

  const keywords = state.status === "ready" ? state.keywords : [];

  return (
    <section aria-labelledby="saved-keywords-title" className="rounded-xl border border-gray-20 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="saved-keywords-title" className="flex items-center gap-2 border-l-4 border-primary-60 pl-3 text-xl font-bold text-primary-90">
          등록한 키워드
          {state.status === "ready" && (
            <span className="text-base font-normal text-gray-50">
              {state.keywords.length}/{state.max}개
            </span>
          )}
        </h2>
        {state.status === "ready" && keywords.length > 0 && (
          <button
            type="button"
            onClick={() => onSearchAll(keywords.map((keyword) => keyword.text))}
            disabled={searching || busy}
            className="flex items-center gap-2 rounded-lg bg-primary-60 px-5 py-2.5 text-base font-medium text-white hover:bg-primary-70 disabled:opacity-40"
          >
            <Search className="h-4 w-4" />
            {searching ? "검색 중…" : `등록한 ${keywords.length}개 한 번에 검색`}
          </button>
        )}
      </div>

      <div className="mt-4">
        {state.status === "loading" && <p className="text-sm text-gray-50">등록한 키워드를 불러오는 중…</p>}

        {state.status === "locked" && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-secondary-5 p-4">
            <Lock className="h-5 w-5 shrink-0 text-gray-50" />
            <p className="min-w-0 flex-1 text-sm text-gray-70">
              등록한 키워드는 담당팀만 볼 수 있도록 비밀번호로 보호됩니다. 비밀번호를 입력하면 목록이 보입니다.
            </p>
            <button
              type="button"
              onClick={() => {
                setState({ status: "loading" });
                setReloadKey((key) => key + 1);
              }}
              className="rounded-lg border border-primary-60 px-4 py-2 text-sm font-medium text-primary-60 hover:bg-primary-5"
            >
              비밀번호 입력하고 보기
            </button>
          </div>
        )}

        {state.status === "error" && (
          <p role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm">
            {state.message}
          </p>
        )}

        {state.status === "ready" &&
          (keywords.length === 0 ? (
            <p className="text-sm text-gray-70">등록한 키워드가 없습니다. 아래에서 키워드를 등록해 두면 다음부터 한 번에 검색할 수 있습니다.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <li key={keyword.id} className="flex items-center rounded-full border border-primary-30 bg-primary-5 text-sm text-primary-70">
                  <button
                    type="button"
                    onClick={() => onPick(keyword.text)}
                    title="검색창에 넣기"
                    className="rounded-l-full py-1.5 pl-3.5 pr-2 font-medium hover:bg-primary-10"
                  >
                    {keyword.text}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(keyword)}
                    disabled={busy}
                    aria-label={`${keyword.text} 지우기`}
                    className="rounded-r-full py-1.5 pl-1 pr-2.5 text-primary-60 hover:bg-primary-10 disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>

      {state.status === "ready" && (
        <form onSubmit={(event) => void add(event)} className="mt-5 flex flex-col gap-2 border-t border-gray-10 pt-5 sm:flex-row">
          <label htmlFor="add-keywords" className="sr-only">
            등록할 키워드
          </label>
          <input
            id="add-keywords"
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            placeholder="새 키워드 등록 (쉼표로 여러 개: 예 환율, 물가)"
            maxLength={500}
            className="min-w-0 flex-1 rounded-lg border border-gray-30 bg-white px-3 py-2.5 text-base"
          />
          <button
            type="submit"
            disabled={busy || adding.trim().length === 0}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-primary-60 px-5 py-2.5 text-base font-medium text-primary-60 hover:bg-primary-5 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            등록
          </button>
        </form>
      )}

      <div aria-live="polite">
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`mt-3 rounded-lg border p-3 text-sm ${
              message.kind === "error" ? "border-red-500/50 bg-red-500/10" : "border-primary-30 bg-primary-5"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      {state.status === "ready" && (
        <p className="mt-3 text-xs text-gray-50">
          등록한 키워드는 수집(<code>npm run collect</code>) 때 유튜브에서 그 밖의 채널 영상을 찾는 데도 쓰입니다. 키워드마다 하루 약 200단위의
          유튜브 검색 한도를 쓰므로 {state.max}개까지 등록할 수 있습니다.
        </p>
      )}
    </section>
  );
}
