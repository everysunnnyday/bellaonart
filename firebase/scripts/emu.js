// Firebase 에뮬레이터(내 PC 안의 가짜 서버) 실행 — project-board/app/scripts/emu.js 와 같은 방식.
// Firestore 에뮬레이터는 Java가 필요하므로, PATH에 없으면 설치 폴더에서 찾아 붙인다.
// 사용: node scripts/emu.js             → 에뮬레이터 실행 (데이터는 .emu-data 에 저장 · 종료 시 보존)
//       node scripts/emu.js exec "<명령>" → 에뮬레이터를 켠 채 명령 실행 후 종료 (자동 검사용)
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 어디서 실행해도 firebase 폴더(firebase.json 있는 곳) 기준으로 동작
process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

const env = { ...process.env };
const adoptium = "C:\\Program Files\\Eclipse Adoptium";
if (existsSync(adoptium)) {
  const jdk = readdirSync(adoptium).filter((d) => d.startsWith("jdk-")).sort().pop();
  if (jdk) env.PATH = path.join(adoptium, jdk, "bin") + path.delimiter + env.PATH;
}

const [mode, cmd] = process.argv.slice(2);
// 미리보기(화면 검증)는 서버 함수(수강 코드)까지 · 자동 검사는 함수 파일을 직접 부르므로 로그인·DB만
const base = ["--project", "demo-bellaon", "--only", mode === "exec" ? "auth,firestore" : "auth,firestore,functions"];
if (mode !== "exec") await import("./sync-core.js");   // 함수가 쓰는 core.js 복사본을 최신으로
// 저장된 데이터가 있을 때만 불러온다(처음엔 폴더가 없어 --import 가 실패하므로)
const imp = existsSync(".emu-data") ? ["--import", ".emu-data"] : [];
const args = mode === "exec"
  ? ["emulators:exec", ...base, cmd]
  : ["emulators:start", ...base, ...imp, "--export-on-exit", ".emu-data"];

// firebase 는 윈도우에서 .cmd 라 shell 로 실행 → 공백 있는 인자는 따옴표로 감싼다
const line = ["firebase", ...args.map((a) => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))].join(" ");
const child = spawn(line, { env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
