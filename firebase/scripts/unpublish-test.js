// 에뮬레이터 전용: 검사가 중간에 멈춰 남은 시험 강좌(files-·free-·free2-·paid-·tag-)를 비공개로 내린다 — 실제 Firebase 에는 쓰지 않는다
// 사용: 에뮬레이터를 켠 상태에서  node scripts/unpublish-test.js
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, getDocs, updateDoc } from "firebase/firestore";

process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const env = await initializeTestEnvironment({
  projectId: "demo-bellaon",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8285 },
});
let n = 0;
await env.withSecurityRulesDisabled(async (c) => {
  for (const d of (await getDocs(collection(c.firestore(), "courses"))).docs) {
    if (/^(files-|free-|free2-|paid-|tag-)/.test(d.id) && d.data().published) { await updateDoc(d.ref, { published: false }); n++; }
  }
});
await env.cleanup();
console.log(`남은 시험 강좌 ${n}개를 비공개로 내렸습니다.`);
