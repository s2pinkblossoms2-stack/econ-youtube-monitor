// 담당자가 채운 확인표로 정확도 계산: `npm run check-accuracy -- 금리`
// 확인표의 "언급함 / 언급안함" 칸을 정답표(앱 판정)와 비교한다. (PLAN 13번, 성공 기준 2)

import { readFileSync } from "node:fs";

// 따옴표로 감싼 칸과 칸 안의 쉼표·줄바꿈을 처리하는 간단한 CSV 읽기
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

type Group = "A" | "B" | "C";

function main(): void {
  const keyword = (process.argv[2] ?? "").trim();
  if (!keyword) throw new Error("사용법: npm run check-accuracy -- 금리");

  const sheet = parseCsv(readFileSync(`check/확인표_${keyword}.csv`, "utf8")).slice(1);
  const key = parseCsv(readFileSync(`check/정답표_${keyword}.csv`, "utf8")).slice(1);
  const meta = JSON.parse(readFileSync(`check/정답표_${keyword}.meta.json`, "utf8")) as {
    population: Record<Group, number>;
  };

  const groupOf = new Map<string, Group>(key.map((row) => [row[0], row[1][0] as Group]));
  const tally: Record<Group, { agree: number; disagree: number }> = {
    A: { agree: 0, disagree: 0 },
    B: { agree: 0, disagree: 0 },
    C: { agree: 0, disagree: 0 },
  };
  let unanswered = 0;

  for (const row of sheet) {
    const group = groupOf.get(row[0]);
    const answer = (row[5] ?? "").replace(/\s+/g, "");
    if (!group) continue;
    if (answer !== "언급함" && answer !== "언급안함") {
      unanswered++;
      continue;
    }
    const mentioned = answer === "언급함";
    // A: 앱이 찾았으니 사람도 "언급함"이면 일치. B·C: 앱이 못 찾았으니 사람이 "언급안함"이면 일치.
    const agree = group === "A" ? mentioned : !mentioned;
    if (agree) tally[group].agree++;
    else tally[group].disagree++;
  }

  const groups: Group[] = ["A", "B", "C"];
  const names: Record<Group, string> = { A: "앱이 자막에서 찾은 영상", B: "제목·태그·설명에만 있던 영상", C: "앱이 못 찾은 영상" };
  console.log(`"${keyword}" 확인 결과 (응답 안 한 칸 ${unanswered}개는 뺌)`);

  let weighted = 0;
  let weight = 0;
  let sampleAgree = 0;
  let sampleTotal = 0;
  for (const g of groups) {
    const total = tally[g].agree + tally[g].disagree;
    sampleAgree += tally[g].agree;
    sampleTotal += total;
    const rate = total > 0 ? tally[g].agree / total : NaN;
    console.log(`  ${g} ${names[g]}: 앱 판정과 일치 ${tally[g].agree}/${total}${total > 0 ? ` (${(rate * 100).toFixed(0)}%)` : ""}`);
    if (total > 0) {
      weighted += meta.population[g] * rate;
      weight += meta.population[g];
    }
  }
  if (sampleTotal === 0) {
    console.log("  아직 채운 칸이 없습니다.");
    return;
  }
  console.log(`표본 전체 일치율: ${((sampleAgree / sampleTotal) * 100).toFixed(0)}% (${sampleAgree}/${sampleTotal})`);
  console.log(`전체 영상 수 비율로 보정한 추정 정확도: ${((weighted / weight) * 100).toFixed(0)}%  (A ${meta.population.A}개, B ${meta.population.B}개, C ${meta.population.C}개 기준)`);
  console.log("※ 표본이 작아서 오차가 큽니다. 참고용 숫자입니다.");
}

main();
