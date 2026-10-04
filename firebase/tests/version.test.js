// 사이트 부품 주소 번호(?v=) 검사 — 규칙·이유는 scripts/site-version.js 맨 위
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, siteFiles, localRefs, rewrite, readVersion, headVersion, siteChangedSinceHead } from "../scripts/site-version.js";

test("모든 우리 js·css 주소가 같은 번호(?v=site-version.txt)", () => {
  const v = readVersion();
  assert.ok(Number.isInteger(v) && v > 0, "site-version.txt 가 숫자가 아님");
  const bad = [];
  for (const f of siteFiles()) {
    for (const r of localRefs(readFileSync(path.join(ROOT, f), "utf8"))) {
      if (r.query !== `?v=${v}`) bad.push(`${f}: ${r.url}${r.query}`);
    }
  }
  assert.deepEqual(bad, [], `번호가 없거나 다른 주소 → cd firebase && npm run ver`);
});

test("사이트가 직전 커밋과 달라졌으면 번호도 올라가 있어야 함", () => {
  if (!siteChangedSinceHead()) return;
  assert.ok(readVersion() > headVersion(), `사이트가 바뀌었는데 번호가 그대로(${readVersion()}) → cd firebase && npm run ver`);
});

test("주소 바꾸기 규칙", () => {
  const src = [
    `import { a } from "./common.js";`,
    `import {\n  b,\n} from "./firebase.js?v=3";`,
    `import "./side.js";`,
    `const m = await import("./lazy.js");`,
    `import { c } from "/js/course-list.js";`,
    `import { d } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";`,
    `<script type="module" src="/js/workshop.js?v=4"></script>`,
    `<link rel="stylesheet" href="/css/shell.css?v=5">`,
  ].join("\n");
  const out = rewrite(src, 7);
  for (const u of ["./common.js", "./firebase.js", "./side.js", "./lazy.js", "/js/course-list.js", "/js/workshop.js", "/css/shell.css"]) {
    assert.ok(out.includes(`${u}?v=7`), u);
  }
  assert.ok(out.includes(`firebase-app.js"`) && !out.includes("firebase-app.js?v"), "외부 주소는 그대로");
  assert.ok(!/\?v=[345]/.test(out), "옛 번호가 남음");
  assert.equal(rewrite(out, 7), out, "두 번 돌려도 같음");
  assert.deepEqual(localRefs(out).filter((r) => r.query !== "?v=7"), [], "검사가 놓치는 주소 없음");
});
