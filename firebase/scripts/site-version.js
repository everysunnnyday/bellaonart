// 사이트 부품 주소 번호(?v=) — 배포 전에 한 번 실행:  cd firebase && npm run ver
//
// 왜 필요한가: GitHub Pages 는 방문자 브라우저에 파일을 10분 보관시킨다(max-age=600).
// 주소가 같으면 브라우저는 옛 사본을 쓰므로, 배포 직후 "새 페이지 스크립트 + 옛 부품"이 섞여 페이지가 멈출 수 있다(2026-10-04 실제 발생).
// → 모든 HTML 의 스크립트·CSS 주소와 js 안의 모든 부품 import 주소에 "같은 번호"를 붙이고, 배포마다 번호를 올린다.
//
// 번호의 단일 기준 = firebase/site-version.txt (숫자 하나). 손으로 고치지 말고 이 도구로.
// - 번호 = 직전 커밋의 번호 + 1 (사이트 html·js·css 가 직전 커밋과 같으면 그대로) → 여러 번 돌려도 숫자가 불어나지 않음
// - 검사(tests/version.test.js, npm test 에 포함): 번호 없는 주소·다른 번호 0개 · 사이트가 바뀌었는데 번호 그대로면 실패
// - 같은 부품을 번호가 다른 주소로 부르면 브라우저가 두 번 실행한다 → 예외 없이 전부 같은 번호여야 한다
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const VERSION_FILE = "firebase/site-version.txt";
const SKIP_DIRS = new Set([".git", "node_modules", "docs", "qa", "firebase", "images", "fonts"]);

// 사이트 파일 목록(배포되는 html·js·css) — ROOT 기준 상대 경로, 구분자 "/"
export function siteFiles(root = ROOT) {
  const out = [];
  const walk = (rel) => {
    for (const e of readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); }
      else if (/\.(html|js|css)$/.test(e.name)) out.push(p);
    }
  };
  walk("");
  return out.sort();
}

// 번호를 붙이는 자리 두 가지
// ① HTML: <script src="/js/x.js"> · <link href="/css/x.css">
const ATTR_RE = /\b(src|href)="(\/(?:js|css)\/[\w.-]+\.(?:js|css))(?:\?v=\d+)?"/g;
// ② 모듈 import: from "./x.js" · import "./x.js" · import("./x.js") · HTML 안의 from "/js/x.js" (외부 https 주소는 제외)
const SPEC_RE = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])((?:\.{1,2}\/|\/js\/)[\w./-]+\.js)(?:\?v=\d+)?\2/g;

// 글 안의 모든 우리 부품 주소에 ?v=번호 (기존 번호는 바꿈)
export function rewrite(text, v) {
  return text
    .replace(ATTR_RE, (_, a, u) => `${a}="${u}?v=${v}"`)
    .replace(SPEC_RE, (_, k, q, u) => `${k}${q}${u}?v=${v}${q}`);
}

// 검사용: 글 안의 "우리 사이트 js·css 를 가리키는 따옴표 주소" 전부 (위 두 자리보다 넓게 잡아 빠뜨림을 찾는다)
const ANY_LOCAL_RE = /(["'])((?:\.{1,2}\/|\/(?!\/))[\w./-]*\.(?:js|css))(\?[^"']*)?\1/g;
export function localRefs(text) {
  return [...text.matchAll(ANY_LOCAL_RE)].map((m) => ({ url: m[2], query: m[3] || "" }));
}

export const readVersion = (root = ROOT) => Number(readFileSync(path.join(root, VERSION_FILE), "utf8").trim());

const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });   // git 영문 경고는 숨김(없는 파일은 예외로 처리)

// 직전 커밋(HEAD)의 번호. 번호 파일이 생기기 전 커밋이면 그때 HTML 에 쓰인 가장 큰 ?v (예전 사본과 겹치지 않게)
export function headVersion() {
  try { return Number(git(["show", `HEAD:${VERSION_FILE}`]).trim()); } catch {}
  let max = 0;
  for (const f of git(["ls-tree", "-r", "--name-only", "HEAD"]).split("\n").filter((f) => f.endsWith(".html"))) {
    for (const m of git(["show", `HEAD:${f}`]).matchAll(/\?v=(\d+)/g)) max = Math.max(max, Number(m[1]));
  }
  return max;
}

// 사이트 html·js·css 가 직전 커밋과 다른가(번호 줄만 다른 것은 제외 — 번호를 빼고 비교)
export function siteChangedSinceHead() {
  const strip = (s) => s.replace(/\?v=\d+/g, "").replace(/\r\n/g, "\n");
  const head = git(["ls-tree", "-r", "--name-only", "HEAD"]).split("\n")
    .filter((f) => /\.(html|js|css)$/.test(f) && !f.split("/").slice(0, -1).some((d) => SKIP_DIRS.has(d)));
  const now = siteFiles();
  if (now.join("\n") !== [...head].sort().join("\n")) return true;   // 새로 생기거나 지운 파일
  return now.some((f) => strip(readFileSync(path.join(ROOT, f), "utf8")) !== strip(git(["show", `HEAD:${f}`])));
}

// 실행: 번호 정하기 → 파일에 쓰기 → 모든 주소 고치기
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = headVersion();
  const v = siteChangedSinceHead() ? base + 1 : base;
  writeFileSync(path.join(ROOT, VERSION_FILE), `${v}\n`);
  let changed = 0;
  for (const f of siteFiles()) {
    const p = path.join(ROOT, f), before = readFileSync(p, "utf8"), after = rewrite(before, v);
    if (after !== before) { writeFileSync(p, after); changed++; }
  }
  console.log(`사이트 번호 ?v=${v} (직전 커밋 ${base}) · 주소를 고친 파일 ${changed}개`);
}
