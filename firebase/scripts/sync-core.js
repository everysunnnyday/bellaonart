// 사이트의 js/core.js(계산 단일 기준)를 메일 서버 폴더로 복사한다.
// 메일 서버(functions)는 자기 폴더만 업로드되므로, 배포·검사 직전에 이 스크립트가 자동 실행된다.
// → functions/core.js 는 "복사본"이다. 직접 고치지 말고 js/core.js 를 고칠 것.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "..", "js", "core.js");
const dst = path.join(here, "..", "functions", "core.js");
const head = "// ⚠ 자동 생성된 복사본 — 직접 고치지 말 것. 원본: 사이트 js/core.js (firebase/scripts/sync-core.js 가 복사)\n";
writeFileSync(dst, head + readFileSync(src, "utf8"));
console.log("core.js 복사 완료 →", path.relative(process.cwd(), dst));
