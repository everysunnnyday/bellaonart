// 파일 창고 보안 규칙 검사 (storage.rules) — 도안 PDF 는 유효 수강권만 · 올리기는 관리자만
// 실행: npm test (firebase 폴더 · 에뮬레이터 auth·firestore·storage 를 켰다가 끝나면 끈다)
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { DAY } from "../../js/core.js";

let env;
const NOW = Date.now();
const T = (ms) => Timestamp.fromMillis(ms);
const as = (uid, email, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).storage();
const admin = () => as("adm", "sun0873@gmail.com");
const anon = () => env.unauthenticatedContext().storage();
const PDF = new Uint8Array(Buffer.from("%PDF-1.4\n% test\n"));
const pdfMeta = { contentType: "application/pdf" };
const webpMeta = { contentType: "image/webp" };

const enr = (uid, o = {}) => ({ uid, courseId: "pub", status: "active", startAt: T(NOW - 5 * DAY), endAt: T(NOW + 20 * DAY), extendedCount: 0, ...o });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-bellaon",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8285 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "config/admins"), { emails: ["sun0873@gmail.com", "bellaon.art@gmail.com"] });
    await setDoc(doc(db, "enrollments/stu_pub"), enr("stu"));
    await setDoc(doc(db, "enrollments/fre_pub"), enr("fre", { endAt: null, source: "free" }));          // 기간 제한 없음
    await setDoc(doc(db, "enrollments/exp_pub"), enr("exp", { startAt: T(NOW - 40 * DAY), endAt: T(NOW - 2 * DAY) }));
    await setDoc(doc(db, "enrollments/rev_pub"), enr("rev", { status: "revoked" }));
    await setDoc(doc(db, "enrollments/fut_pub"), enr("fut", { startAt: T(NOW + 3 * DAY) }));
    await setDoc(doc(db, "enrollments/unv_pub"), enr("unv"));
    const st = c.storage();
    await uploadBytes(ref(st, "courses/pub/patterns/1001.pdf"), PDF, pdfMeta);
    await uploadBytes(ref(st, "courses/pub/patterns/notes.pdf"), PDF, pdfMeta);   // 정한 이름(숫자.pdf)이 아닌 것
    await uploadBytes(ref(st, "courses/pub/thumb-1.webp"), new Uint8Array([1, 2, 3]), webpMeta);
    await uploadBytes(ref(st, "courses/pub/secret.txt"), new Uint8Array([1]), { contentType: "text/plain" });
  });
});

test("도안 받기: 관리자·유효 수강생·기간 제한 없음(무료) 수강생만 · 비회원/미수강/만료/회수/시작 전/미인증 차단", async () => {
  const p = (s) => ref(s, "courses/pub/patterns/1001.pdf");
  await assertFails(getBytes(ref(as("stu", "stu@x.com"), "courses/pub/patterns/notes.pdf")));   // 이름 규칙 밖은 수강생도 못 받음
  await assertSucceeds(getBytes(p(admin())));
  await assertSucceeds(getBytes(p(as("stu", "stu@x.com"))));
  await assertSucceeds(getDownloadURL(p(as("fre", "fre@x.com"))));
  await assertFails(getBytes(p(anon())));
  await assertFails(getDownloadURL(p(anon())));
  await assertFails(getBytes(p(as("oth", "oth@x.com"))));
  await assertFails(getBytes(p(as("exp", "exp@x.com"))));
  await assertFails(getBytes(p(as("rev", "rev@x.com"))));
  await assertFails(getBytes(p(as("fut", "fut@x.com"))));
  await assertFails(getBytes(p(as("unv", "unv@x.com", false))));
  await assertFails(getBytes(p(as("fake", "sun0873@gmail.com", false))));   // 미인증이면 관리자 아님
});

test("도안 올리기·지우기: 관리자만 · PDF 만 · 20MB 이하", async () => {
  const p = (s, cid = "pub", id = "1001") => ref(s, `courses/${cid}/patterns/${id}.pdf`);
  await assertSucceeds(uploadBytes(p(admin(), "new"), PDF, pdfMeta));
  await assertSucceeds(uploadBytes(p(admin(), "new", "1002"), PDF, pdfMeta));                      // 여러 개
  await assertFails(uploadBytes(ref(admin(), "courses/new/patterns/도안.pdf"), PDF, pdfMeta));      // 이름은 번호만
  await assertFails(uploadBytes(p(as("stu", "stu@x.com"), "new"), PDF, pdfMeta));
  await assertFails(uploadBytes(p(admin(), "new"), PDF, { contentType: "image/png" }));
  await assertFails(uploadBytes(p(admin(), "big"), new Uint8Array(20 * 1024 * 1024 + 1), pdfMeta));
  await assertSucceeds(uploadBytes(p(admin(), "max"), new Uint8Array(20 * 1024 * 1024), pdfMeta));
  await assertFails(deleteObject(p(as("stu", "stu@x.com"))));
  await assertSucceeds(deleteObject(p(admin())));
});

test("썸네일: 누구나 보기 · 관리자만 WebP(2MB 이하·thumb-숫자.webp)로 올리기 · 다른 파일은 못 봄", async () => {
  await assertSucceeds(getBytes(ref(anon(), "courses/pub/thumb-1.webp")));
  await assertFails(getBytes(ref(anon(), "courses/pub/secret.txt")));
  await assertSucceeds(uploadBytes(ref(admin(), "courses/pub/thumb-2.webp"), new Uint8Array([1]), webpMeta));
  await assertFails(uploadBytes(ref(admin(), "courses/pub/thumb-3.png"), new Uint8Array([1]), { contentType: "image/png" }));
  await assertFails(uploadBytes(ref(admin(), "courses/pub/thumb-4.webp"), new Uint8Array([1]), { contentType: "image/png" }));
  await assertFails(uploadBytes(ref(admin(), "courses/pub/cover.webp"), new Uint8Array([1]), webpMeta));
  await assertFails(uploadBytes(ref(admin(), "courses/pub/thumb-5.webp"), new Uint8Array(2 * 1024 * 1024 + 1), webpMeta));
  await assertFails(uploadBytes(ref(as("stu", "stu@x.com"), "courses/pub/thumb-6.webp"), new Uint8Array([1]), webpMeta));
  await assertFails(deleteObject(ref(as("stu", "stu@x.com"), "courses/pub/thumb-1.webp")));
  await assertSucceeds(deleteObject(ref(admin(), "courses/pub/thumb-1.webp")));
  await assertFails(uploadBytes(ref(admin(), "other/x.webp"), new Uint8Array([1]), webpMeta));   // 정한 자리 밖은 아무도
});
