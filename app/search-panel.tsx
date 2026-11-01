"use client";

// 검색창과 결과 화면. 서버의 /api/search만 부르고, 유튜브나 저장소에는 직접 접속하지 않는다.

import { useRef, useState, type FormEvent } from "react";
import type { SearchResponse, SearchResultItem } from "@/lib/search/search";
import { MAX_PAGE, PAGE_SIZE } from "@/lib/search/validate";
import { ResultCard } from "./result-card";
import { SavedKeywords } from "./saved-keywords";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; keywords: string[]; data: SearchResponse };

export function SearchPanel() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  // 늦게 도착한 이전 요청이 새 결과를 덮어쓰지 않게 요청 번호를 기억한다.
  const requestId = useRef(0);

  async function run(keywordText: string, page: number) {
    const id = ++requestId.current;
    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/search?keywords=${encodeURIComponent(keywordText)}&page=${page}`);
      const body: unknown = await response.json().catch(() => null);
      if (id !== requestId.current) return;
      if (!response.ok) {
        const message = isErrorBody(body) ? body.error : "검색하지 못했습니다. 잠시 후 다시 시도해 주세요.";
        setState({ status: "error", message });
        return;
      }
      setState({ status: "done", keywords: splitKeywords(keywordText), data: body as SearchResponse });
    } catch {
      if (id !== requestId.current) return;
      setState({ status: "error", message: "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (input.trim().length === 0) return;
    void run(input, 1);
  }

  // 저장한 키워드를 눌렀을 때 검색창에 더한다. 이미 들어 있으면 다시 넣지 않는다.
  function addToInput(keyword: string) {
    const current = splitKeywords(input);
    if (current.some((existing) => existing.toLowerCase() === keyword.toLowerCase())) return;
    setInput([...current, keyword].join(", "));
  }

  const loading = state.status === "loading";

  return (
    <div className="w-full">
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="keywords" className="sr-only">
          검색할 키워드
        </label>
        <input
          id="keywords"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={500}
          placeholder="키워드를 쉼표로 구분해 입력하세요 (예: 금리, 환율)"
          className="min-w-0 flex-1 rounded-lg border border-foreground/30 bg-background px-3 py-2.5 text-base"
        />
        <button
          type="submit"
          disabled={loading || input.trim().length === 0}
          className="rounded-lg bg-foreground px-5 py-2.5 text-base font-medium text-background disabled:opacity-40"
        >
          {loading ? "검색 중…" : "검색"}
        </button>
      </form>
      <p className="mt-2 text-sm text-foreground/70">
        최근 14일 안에 올라온 영상의 자막에서 찾습니다. 키워드는 최대 10개까지, 하나라도 나오면 결과에 포함됩니다.
      </p>

      <SavedKeywords input={input} onPick={addToInput} />

      <div aria-live="polite" className="mt-6">
        {state.status === "loading" && <p className="text-foreground/70">자막을 찾고 있습니다. 몇 초 걸릴 수 있어요.</p>}
        {state.status === "error" && (
          <p role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 p-3">
            {state.message} (확인하지 못한 것이며, 언급이 없다는 뜻이 아닙니다.)
          </p>
        )}
        {state.status === "done" && (
          <Results
            keywords={state.keywords}
            data={state.data}
            onPage={(page) => void run(state.keywords.join(","), page)}
          />
        )}
      </div>
    </div>
  );
}

function Results({ keywords, data, onPage }: { keywords: string[]; data: SearchResponse; onPage: (page: number) => void }) {
  const rawPages = Math.max(
    1,
    Math.ceil(Math.max(data.totalMain, data.totalUnverified, data.totalSmall) / PAGE_SIZE),
  );
  // 서버가 받는 쪽 수에는 상한이 있다. 넘는 결과는 보여줄 수 없으니 안내한다.
  const totalPages = Math.min(rawPages, MAX_PAGE);
  const truncated = rawPages > MAX_PAGE;
  const nothing = data.totalMain === 0 && data.totalUnverified === 0 && data.totalSmall === 0;

  return (
    <div className="space-y-8">
      {data.unchecked.length > 0 && (
        <p role="status" className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
          {data.unchecked.length}개 채널은 확인하지 못했습니다. 아래는 일부 결과입니다: {data.unchecked.map((c) => c.channelName).join(", ")}
        </p>
      )}

      {nothing ? (
        <p className="rounded-lg border border-foreground/15 p-4">
          최근 14일 안에 &ldquo;{keywords.join(", ")}&rdquo;을(를) 언급한 영상이 없습니다. (언급 없음)
          {data.pendingKeywords.length > 0 &&
            ` 단, "${data.pendingKeywords.join(", ")}"은(는) 아직 유튜브 검색을 거치지 않아 그 밖의 채널은 다음 수집 후에 나옵니다.`}
        </p>
      ) : (
        <>
          <Section title="24개 주요 채널" total={data.totalMain} items={data.main} keywords={keywords} empty="이 구역에는 언급한 영상이 없습니다." />
          {data.totalUnverified > 0 && (
            <Section
              title="확인불가 · 언급 가능성 높음 (자막을 받지 못한 24개 채널 영상)"
              total={data.totalUnverified}
              items={data.unverified}
              keywords={keywords}
              empty="이 쪽에는 영상이 없습니다."
              note="자막을 받지 못해 영상에서 한 말은 확인하지 못했습니다. 제목·태그·설명에 키워드가 있어 언급했을 가능성이 높은 영상이니, 링크로 직접 확인해 주세요."
            />
          )}
          <Section
            title="그 밖의 채널 (제목·태그·설명에서 찾음)"
            total={data.totalSmall}
            items={data.small}
            keywords={keywords}
            empty="결과가 없습니다."
            note={
              data.pendingKeywords.length > 0
                ? `"${data.pendingKeywords.join(", ")}"은(는) 아직 유튜브 검색을 거치지 않아, 그 밖의 채널 결과는 다음 수집 후에 나옵니다.`
                : undefined
            }
          />
          {truncated && (
            <p role="status" className="text-sm text-foreground/70">
              결과가 많아 최신 {MAX_PAGE * PAGE_SIZE}건까지만 볼 수 있습니다. 키워드를 더 구체적으로 입력하면 줄어듭니다.
            </p>
          )}
          {totalPages > 1 && (
            <nav aria-label="쪽 이동" className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => onPage(data.page - 1)}
                disabled={data.page <= 1}
                className="rounded-lg border border-foreground/30 px-4 py-2 disabled:opacity-40"
              >
                이전
              </button>
              <span className="text-sm">
                {data.page} / {totalPages}쪽
              </span>
              <button
                type="button"
                onClick={() => onPage(data.page + 1)}
                disabled={data.page >= totalPages}
                className="rounded-lg border border-foreground/30 px-4 py-2 disabled:opacity-40"
              >
                다음
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function Section(props: {
  title: string;
  total: number;
  items: SearchResultItem[];
  keywords: string[];
  empty: string;
  note?: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">
        {props.title} <span className="font-normal text-foreground/70">· {props.total}건</span>
      </h2>
      {props.note && <p className="mb-3 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm">{props.note}</p>}
      {props.items.length === 0 ? (
        <p className="text-foreground/70">{props.empty}</p>
      ) : (
        <ul className="space-y-3">
          {props.items.map((item) => (
            <ResultCard key={item.videoUrl} item={item} searchedKeywords={props.keywords} />
          ))}
        </ul>
      )}
    </section>
  );
}

// 서버 검사와 같은 방식으로 쉼표로 나눈다. (화면에서 강조할 키워드를 정하는 용도)
function splitKeywords(text: string): string[] {
  return text
    .split(",")
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}

function isErrorBody(body: unknown): body is { error: string } {
  return typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string";
}
