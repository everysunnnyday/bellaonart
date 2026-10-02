// 에뮬레이터(내 PC 가짜 서버)에 관리자 명단만 넣는다 — 실제 Firebase 에는 쓰지 않는다.
// 사용: 에뮬레이터를 켠 상태에서  node scripts/seed.js
// (실제 프로젝트의 관리자 명단은 docs/02_Firebase-설정안내.md 의 콘솔 입력으로 만든다)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const env = await initializeTestEnvironment({
  projectId: "demo-bellaon",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8285 },
});
await env.withSecurityRulesDisabled(async (c) => {
  // 실제와 같은 두 관리자(D11) + 에뮬레이터 화면 검증용 관리자
  await setDoc(doc(c.firestore(), "config/admins"), { emails: ["sun0873@gmail.com", "bellaon.art@gmail.com", "admin@test.com"] });
});
await env.cleanup();
console.log("에뮬레이터에 관리자 명단을 넣었습니다.");
process.exit(0);
