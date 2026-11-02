"use client";

// 검색창, 등록한 키워드, 결과 화면. 서버의 /api/search만 부르고, 유튜브나 저장소에는 직접 접속하지 않는다.

import { useRef, useState, type FormEvent } from "react";
import { Download, Search } from "lucide-react";
import { exportFileName, formatExport } from "@/lib/search/export-text";
import type { ManualResult } from "@/lib/search/paste";
import type { ExportResult, SearchResponse, SearchResultItem } from "@/lib/search/search";
import { MAX_EXPORT_PART, MAX_KEYWORDS, MAX_PAGE, PAGE_SIZE, type ExportSection } from "@/lib/search/validate";
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
  // 담당자가 스크립트를 직접 붙여넣어 확인한 결과(영상 ID별). 키워드가 바뀌면 지운다.
  const [manual, setManual] = useState<Record<string, ManualResult>>({});
  const lastKeywordsKey = useRef("");

  function setManualResult(videoId: string, result: ManualResult | null) {
    setManual((previous) => {
      const next = { ...previous };
      if (result) next[videoId] = result;
      else delete next[videoId];
      return next;
    });
  }

  async function run(keywordText: string, page: number) {
    const id = ++requestId.current;
    const key = splitKeywords(keywordText)
      .map((keyword) => keyword.replace(/\s+/g, "").toLowerCase())
      .sort()
      .join("|");
    if (key !== lastKeywordsKey.current) {
      lastKeywordsKey.current = key;
      setManual({});
    }
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

  // 등록한 키워드를 눌렀을 때 검색창에 더한다. 이미 들어 있으면 다시 넣지 않는다.
  function addToInput(keyword: string) {
    const current = splitKeywords(input);
    if (current.some((existing) => existing.toLowerCase() === keyword.toLowerCase())) return;
    setInput([...current, keyword].join(", "));
  }

  // 등록한 키워드 전체를 검색창에 넣고 한 번에 검색한다.
  function searchAll(keywords: string[]) {
    const text = keywords.join(", ");
    setInput(text);
    void run(text, 1);
  }

  const loading = state.status === "loading";

  return (
    <div className="space-y-6">
      <section aria-label="키워드 검색" className="rounded-xl border border-gray-20 bg-white p-5 sm:p-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="keywords" className="sr-only">
            검색할 키워드
          </label>
          <input
            id="keywords"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={2000}
            placeholder="키워드를 쉼표로 구분해 입력하세요 (예: 금리, 환율)"
            className="min-w-0 flex-1 rounded-lg border border-gray-30 bg-white px-4 py-3 text-base"
          />
          <button
            type="submit"
            disabled={loading || input.trim().length === 0}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary-60 px-7 py-3 text-base font-semibold text-white hover:bg-primary-70 disabled:opacity-40"
          >
            <Search className="h-4 w-4" />
            {loading ? "검색 중…" : "검색"}
          </button>
        </form>
        <p className="mt-3 text-sm text-gray-70">
          최근 14일 안에 올라온 영상의 자막에서 찾습니다. 키워드는 한 번에 {MAX_KEYWORDS}개까지 넣을 수 있고, 하나라도 나오면 결과에 포함됩니다.
        </p>
      </section>

      <SavedKeywords searching={loading} onPick={addToInput} onSearchAll={searchAll} />

      <div aria-live="polite">
        {state.status === "loading" && (
          <p className="rounded-xl border border-gray-20 bg-white p-5 text-gray-70">자막을 찾고 있습니다. 키워드가 많으면 몇 초 걸릴 수 있어요.</p>
        )}
        {state.status === "error" && (
          <p role="alert" className="rounded-xl border border-red-500/50 bg-red-500/10 p-4">
            {state.message} (확인하지 못한 것이며, 언급이 없다는 뜻이 아닙니다.)
          </p>
        )}
        {state.status === "done" && (
          <Results
            keywords={state.keywords}
            data={state.data}
            manual={manual}
            onManual={setManualResult}
            onPage={(page) => void run(state.keywords.join(","), page)}
          />
        )}
      </div>
    </div>
  );
}

type ResultTab = "main" | "unverified" | "small";

function Results({
  keywords,
  data,
  manual,
  onManual,
  onPage,
}: {
  keywords: string[];
  data: SearchResponse;
  manual: Record<string, ManualResult>;
  onManual: (videoId: string, result: ManualResult | null) => void;
  onPage: (page: number) => void;
}) {
  // 세 구역을 탭으로 나눠 한 구역씩 보여준다. 처음에는 결과가 있는 첫 구역을 연다.
  const [tab, setTab] = useState<ResultTab>(() => (data.totalMain > 0 ? "main" : data.totalUnverified > 0 ? "unverified" : data.totalSmall > 0 ? "small" : "main"));
  const activeTotal = tab === "main" ? data.totalMain : tab === "unverified" ? data.totalUnverified : data.totalSmall;
  const rawPages = Math.max(1, Math.ceil(activeTotal / PAGE_SIZE));
  // 서버가 받는 쪽 수에는 상한이 있다. 넘는 결과는 보여줄 수 없으니 안내한다.
  const totalPages = Math.min(rawPages, MAX_PAGE);
  const truncated = rawPages > MAX_PAGE;
  const nothing = data.totalMain === 0 && data.totalUnverified === 0 && data.totalSmall === 0;
  const keywordLabel = keywords.length > 5 ? `${keywords.slice(0, 5).join(", ")} 외 ${keywords.length - 5}개` : keywords.join(", ");

  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-70">
        검색한 키워드 <strong className="text-primary-90">{keywordLabel}</strong> · 24개 주요 채널 {data.totalMain}건 · 확인불가 {data.totalUnverified}건 · 그 밖의
        채널 {data.totalSmall}건
      </p>

      {!nothing && <DownloadBar keywords={keywords} data={data} manual={manual} />}

      {data.unchecked.length > 0 && (
        <p role="status" className="rounded-xl border border-amber-500/60 bg-amber-500/10 p-4 text-sm">
          {data.unchecked.length}개 채널은 확인하지 못했습니다. 아래는 일부 결과입니다: {data.unchecked.map((c) => c.channelName).join(", ")}
        </p>
      )}

      {nothing ? (
        <p className="rounded-xl border border-gray-20 bg-white p-5">
          최근 14일 안에 &ldquo;{keywordLabel}&rdquo;을(를) 언급한 영상이 없습니다. (언급 없음)
          {data.pendingKeywords.length > 0 &&
            ` 단, "${data.pendingKeywords.join(", ")}"은(는) 아직 유튜브 검색을 거치지 않아 그 밖의 채널은 다음 수집 후에 나옵니다.`}
        </p>
      ) : (
        <>
          <div role="tablist" aria-label="결과 구역" className="flex flex-wrap gap-2 border-b border-gray-20">
            {(
              [
                { id: "main", label: "24개 주요 채널", total: data.totalMain },
                { id: "unverified", label: "확인불가", total: data.totalUnverified },
                { id: "small", label: "그 밖의 채널", total: data.totalSmall },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`-mb-px border-b-2 px-4 py-2 text-base font-semibold ${tab === item.id ? "border-primary-60 text-primary-60" : "border-transparent text-gray-50 hover:text-primary-60"}`}
              >
                {item.label} <span className="text-sm font-normal">{item.total}건</span>
              </button>
            ))}
          </div>
          {tab === "main" && (
            <Section
              title="24개 주요 채널"
              total={data.totalMain}
              items={data.main}
              keywords={keywords}
              empty="이 구역에는 언급한 영상이 없습니다."
              manual={manual}
              onManual={onManual}
            />
          )}
          {tab === "unverified" && (
            <Section
              title="확인불가 · 언급 가능성 높음"
              total={data.totalUnverified}
              items={data.unverified}
              keywords={keywords}
              empty="자막을 받지 못한 영상 중 키워드가 걸린 영상이 없습니다."
              note="자막을 받지 못한 24개 채널 영상입니다. 영상에서 한 말은 확인하지 못했고, 제목·태그·설명에 키워드가 있어 언급했을 가능성이 높은 영상입니다. 링크로 직접 확인하시거나, 유튜브에서 스크립트를 복사해 아래 칸에 붙여넣으면 키워드를 찾아 드립니다."
              manual={manual}
              onManual={onManual}
            />
          )}
          {tab === "small" && (
          <Section
            title="그 밖의 채널"
            total={data.totalSmall}
            items={data.small}
            keywords={keywords}
            empty="결과가 없습니다."
            note={
              data.pendingKeywords.length > 0
                ? `"${data.pendingKeywords.join(", ")}"은(는) 아직 유튜브 검색을 거치지 않아, 그 밖의 채널 결과는 다음 수집 후에 나옵니다.`
                : "유튜브 검색에서 제목·태그·설명에 키워드가 있어 모은 영상입니다. 자막을 받은 영상은 실제 언급 구절을 보여주고, 자막을 받지 못한 영상(자막 확인불가)은 제목·태그·설명에서만 찾은 결과입니다. 스크립트를 복사해 붙여넣으면 영상 속 언급까지 확인할 수 있습니다."
            }
            manual={manual}
            onManual={onManual}
          />
          )}
          {truncated && (
            <p role="status" className="text-sm text-gray-70">
              결과가 많아 최신 {MAX_PAGE * PAGE_SIZE}건까지만 볼 수 있습니다. 키워드를 더 구체적으로 입력하면 줄어듭니다.
            </p>
          )}
          {totalPages > 1 && (
            <nav aria-label="쪽 이동" className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => onPage(data.page - 1)}
                disabled={data.page <= 1}
                className="rounded-lg border border-gray-30 bg-white px-5 py-2 text-gray-80 hover:border-primary-50 disabled:opacity-40"
              >
                이전
              </button>
              <span className="text-sm text-gray-70">
                {data.page} / {totalPages}쪽
              </span>
              <button
                type="button"
                onClick={() => onPage(data.page + 1)}
                disabled={data.page >= totalPages}
                className="rounded-lg border border-gray-30 bg-white px-5 py-2 text-gray-80 hover:border-primary-50 disabled:opacity-40"
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

// 결과 내려받기: ① 지금 화면에 보이는 결과(직접 붙여넣어 확인한 것 포함)를 바로 받기 ② 서버에서 전체 결과를 300건씩 받기
const DOWNLOAD_SECTIONS: { section: ExportSection; label: string; fileLabel?: string }[] = [
  { section: "all", label: "전체 (세 구역을 나눠서 한 파일로)" },
  { section: "main", label: "24개 주요 채널만", fileLabel: "주요채널" },
  { section: "unverified", label: "확인불가만", fileLabel: "확인불가" },
  { section: "small", label: "그 밖의 채널만", fileLabel: "그밖의채널" },
];

// 브라우저가 파일을 받게 한다. 윈도우 메모장에서도 한글이 깨지지 않게 파일 맨 앞에 BOM을 붙인다.
function saveTextFile(text: string, fileName: string) {
  const blob = new Blob(["﻿", text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DownloadBar({ keywords, data, manual }: { keywords: string[]; data: SearchResponse; manual: Record<string, ManualResult> }) {
  const manualCount = Object.keys(manual).length;
  const [busy, setBusy] = useState<ExportSection | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  function downloadScreen() {
    const generatedAt = new Date();
    const items = [...data.main, ...data.unverified, ...data.small];
    const text = formatExport(
      items.map((item) => ({ item, manual: manual[item.videoId] })),
      { keywords, generatedAt, totals: { main: data.totalMain, unverified: data.totalUnverified, small: data.totalSmall } },
    );
    saveTextFile(text, exportFileName(keywords, generatedAt));
  }

  // 서버가 한 번에 300개까지만 만들 수 있어서, 묶음을 차례로 받아 이어 붙여 파일 하나로 만든다. 구역은 파일 안에서 제목으로 나뉜다.
  async function downloadAll(choice: (typeof DOWNLOAD_SECTIONS)[number]) {
    if (busy) return;
    setBusy(choice.section);
    setError(null);
    try {
      const items: SearchResultItem[] = [];
      let totals = { main: 0, unverified: 0, small: 0 };
      let partCount = 1;
      for (let part = 1; part <= partCount; part++) {
        setProgress(`${part}/${partCount} 묶음 받는 중…`);
        const query = new URLSearchParams({ keywords: keywords.join(","), part: String(part), section: choice.section, format: "json" });
        const response = await fetch(`/api/export?${query.toString()}`);
        const body = (await response.json().catch(() => null)) as ExportResult | { error?: string } | null;
        if (!response.ok || !body || !("items" in body)) throw new Error((body && "error" in body && body.error) || "내려받기에 실패했습니다.");
        items.push(...body.items);
        totals = { main: body.totalMain, unverified: body.totalUnverified, small: body.totalSmall };
        partCount = Math.min(body.partCount, MAX_EXPORT_PART);
      }
      const generatedAt = new Date();
      const text = formatExport(
        items.map((item) => ({ item })),
        { keywords, generatedAt, totals },
      );
      saveTextFile(text, exportFileName(keywords, generatedAt, undefined, choice.fileLabel));
    } catch (e) {
      setError(e instanceof Error ? e.message : "내려받기에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(null);
      setProgress("");
    }
  }

  return (
    <section aria-label="결과 내려받기" className="rounded-xl border border-primary-20 bg-primary-5 p-4 sm:p-5">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-primary-90">
        <Download className="h-5 w-5" />
        결과를 txt 파일로 내려받기
      </h2>
      <p className="mb-3 text-sm text-gray-70">
        링크, 영상 제목, 채널명, 게시 날짜, 언급한 시간대와 내용(자막 원문 구절)이 들어갑니다. 내용은 요약이 아니라 자막 원문입니다. 파일 안에서는 구역별로 나뉘고, 각 구역은 최신 게시 순입니다.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={downloadScreen}
          className="flex items-center gap-2 rounded-lg bg-primary-60 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-70"
        >
          <Download className="h-4 w-4" />
          지금 화면의 결과 받기
        </button>
        {manualCount > 0 && <span className="text-xs text-primary-70">직접 붙여넣어 확인한 {manualCount}건 포함</span>}
      </div>

      <div className="mt-4 border-t border-primary-20 pt-3">
        <p className="mb-2 text-sm font-medium text-primary-90">전체 결과 받기 (모든 쪽의 결과를 파일 하나로 · 만드는 데 수십 초 걸릴 수 있습니다)</p>
        <ul className="flex flex-wrap gap-2">
          {DOWNLOAD_SECTIONS.map((choice) => (
            <li key={choice.section}>
              <button
                type="button"
                onClick={() => void downloadAll(choice)}
                disabled={busy !== null}
                className="inline-block rounded-lg border border-primary-60 bg-white px-3 py-1.5 text-sm font-medium text-primary-60 hover:bg-primary-10 disabled:opacity-50"
              >
                {busy === choice.section ? progress : choice.label}
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-50">전체 결과 파일에는 직접 붙여넣어 확인한 내용이 들어가지 않습니다. 그 내용까지 받으려면 위의 &ldquo;지금 화면의 결과 받기&rdquo;를 쓰세요.</p>
      </div>
    </section>
  );
}

function Section(props: {
  title: string;
  total: number;
  items: SearchResultItem[];
  keywords: string[];
  empty: string;
  note?: string;
  manual: Record<string, ManualResult>;
  onManual: (videoId: string, result: ManualResult | null) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 border-l-4 border-primary-60 pl-3 text-xl font-bold text-primary-90">
        {props.title} <span className="text-base font-normal text-gray-50">{props.total}건</span>
      </h2>
      {props.note && <p className="mb-3 rounded-lg bg-secondary-5 p-3 text-sm text-gray-70">{props.note}</p>}
      {props.items.length === 0 ? (
        <p className="text-gray-70">{props.empty}</p>
      ) : (
        <ul className="space-y-3">
          {props.items.map((item) => (
            <ResultCard
              key={item.videoUrl}
              item={item}
              searchedKeywords={props.keywords}
              manual={props.manual[item.videoId]}
              onManual={props.onManual}
            />
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
