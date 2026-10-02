// 수강 코드 검사 (redeem.js) — 에뮬레이터 Firestore 에서 "줘야 할 때만 주는지" 확인
// 실행: firebase 폴더에서 npm test (emulators:exec 가 FIRESTORE_EMULATOR_HOST 를 넣어준다)
// ※ 이 파일은 배포에서 제외된다(firebase.json functions.ignore)
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { redeem, MAX_FAILS, FAIL_WINDOW } from "./redeem.js";
import { DEFAULT_POLICY, DAY, kstDateStr, startOfKstDay, endOfKstDay, defaultEndStr } from "./core.js";

let db;
const NOW = Date.parse("2026-10-05T14:00:00+09:00");
const who = (uid, o = {}) => ({ uid, email: `${uid}@x.com`, emailVerified: true, ...o });
const code = (o = {}) => ({ courseId: "pub", maxUses: null, expiresAt: null, active: true, memo: "", usedCount: 0, createdBy: "adm", ...o });
const enrOf = async (id) => (await db.doc(`enrollments/${id}`).get()).data();

before(() => { initializeApp({ projectId: "demo-bellaon" }); db = getFirestore(); });
beforeEach(async () => {
  for (const c of ["codes", "codeFails", "enrollments", "courses"]) await db.recursiveDelete(db.collection(c));
  const b = db.batch();
  b.set(db.doc("config/policy"), { ...DEFAULT_POLICY });
  b.set(db.doc("courses/pub"), { title: "공개", published: true });
  b.set(db.doc("courses/d30"), { title: "30일 강좌", published: true, defaultDays: 30 });
  b.set(db.doc("courses/hid"), { title: "비공개", published: false });
  b.set(db.doc("codes/comos2026"), code());
  b.set(db.doc("codes/d30-code"), code({ courseId: "d30" }));
  b.set(db.doc("codes/stopped"), code({ active: false }));
  b.set(db.doc("codes/old-code"), code({ expiresAt: Timestamp.fromMillis(NOW - DAY) }));
  b.set(db.doc("codes/one-left"), code({ maxUses: 1 }));
  b.set(db.doc("codes/full-code"), code({ maxUses: 2, usedCount: 2 }));
  b.set(db.doc("codes/hid-code"), code({ courseId: "hid" }));
  await b.commit();
});

test("성공: 오늘 시작 · 기본 60일(오늘 포함) · 사용 1회 기록 · 출처 '코드'", async () => {
  const r = await redeem(db, who("a"), "comos2026", NOW);
  assert.equal(r.ok, true);
  const e = await enrOf("a_pub");
  const today = kstDateStr(NOW);
  assert.equal(e.status, "active");
  assert.equal(e.startAt.toMillis(), startOfKstDay(today));
  assert.equal(e.endAt.toMillis(), endOfKstDay(defaultEndStr(today, 60)));
  assert.equal(kstDateStr(e.endAt.toMillis()), "2026-12-03");          // 10/5 ~ 12/3 = 60일
  assert.deepEqual([e.source, e.code, e.extendedCount], ["code", "comos2026", 0]);
  assert.equal((await db.doc("codes/comos2026").get()).data().usedCount, 1);
  assert.ok((await db.doc("codes/comos2026/uses/a").get()).exists);
});

test("강좌에 따로 정한 수강일(30일)이 있으면 그것을 쓴다 — 관리자 부여와 같은 계산", async () => {
  await redeem(db, who("a"), "d30-code", NOW);
  assert.equal(kstDateStr((await enrOf("a_d30")).endAt.toMillis()), "2026-11-03");
});

test("대소문자·앞뒤 공백은 무시", async () => {
  assert.equal((await redeem(db, who("a"), "  COMOS2026 ", NOW)).ok, true);
});

test("거절: 미인증 · 없는 코드 · 중지 · 마감 · 인원 초과 · 비공개 강좌 · 운영 기준 없음", async () => {
  const r = async (c, w = who("a")) => (await redeem(db, w, c, NOW)).reason;
  assert.equal(await r("comos2026", who("a", { emailVerified: false })), "unverified");
  assert.equal(await r("nope-code"), "invalid");
  assert.equal(await r("x"), "invalid");                                // 글자 규칙 위반도 '없는 코드'
  assert.equal(await r("stopped"), "stopped");
  assert.equal(await r("old-code"), "expired");
  assert.equal(await r("full-code"), "full");
  assert.equal(await r("hid-code"), "course");
  await db.doc("config/policy").delete();
  assert.equal(await r("comos2026"), "not-ready");
  assert.equal(await enrOf("a_pub"), undefined);                        // 아무것도 안 만들어짐
});

test("한 사람 1회: 같은 코드 두 번 · 기간이 끝난 뒤에도 같은 코드는 거절", async () => {
  assert.equal((await redeem(db, who("a"), "comos2026", NOW)).ok, true);
  assert.equal((await redeem(db, who("a"), "comos2026", NOW)).reason, "enrolled");
  assert.equal((await redeem(db, who("a"), "comos2026", NOW + 100 * DAY)).reason, "used");
  assert.equal((await db.doc("codes/comos2026").get()).data().usedCount, 1);
});

test("이미 수강 중이면 다른 코드로도 거절 · 회수된 수강권은 코드로 되살리지 않음 · 기간 끝난 회원은 새 코드로 다시", async () => {
  await db.doc("codes/second").set(code());
  await redeem(db, who("a"), "comos2026", NOW);
  assert.equal((await redeem(db, who("a"), "second", NOW)).reason, "enrolled");

  await db.doc("enrollments/r_pub").set({ uid: "r", courseId: "pub", status: "revoked",
    startAt: Timestamp.fromMillis(NOW - DAY), endAt: Timestamp.fromMillis(NOW + 30 * DAY), extendedCount: 0 });
  assert.equal((await redeem(db, who("r"), "second", NOW)).reason, "revoked");

  await db.doc("enrollments/x_pub").set({ uid: "x", courseId: "pub", status: "active",
    startAt: Timestamp.fromMillis(NOW - 90 * DAY), endAt: Timestamp.fromMillis(NOW - 2 * DAY), extendedCount: 1 });
  assert.equal((await redeem(db, who("x"), "second", NOW)).ok, true);
  const e = await enrOf("x_pub");
  assert.equal(e.extendedCount, 0);                                     // 새 기간 = 연장 기회도 새로
  assert.ok(e.endAt.toMillis() > NOW + 50 * DAY);
});

test(`틀린 코드 ${MAX_FAILS}번이면 1시간 동안 맞는 코드도 막힘 · 1시간 뒤 풀림 · 다른 회원은 영향 없음`, async () => {
  for (let i = 0; i < MAX_FAILS; i++) assert.equal((await redeem(db, who("a"), `wrong-${i}`, NOW)).reason, "invalid");
  assert.equal((await redeem(db, who("a"), "comos2026", NOW)).reason, "too-many");
  assert.equal((await redeem(db, who("b"), "comos2026", NOW)).ok, true);
  assert.equal((await redeem(db, who("a"), "comos2026", NOW + FAIL_WINDOW + 1)).ok, true);
});

test("마지막 한 자리에 두 사람이 동시에: 한 명만 성공", async () => {
  const rs = await Promise.all(["p", "q", "s"].map((u) => redeem(db, who(u), "one-left", NOW)));
  assert.equal(rs.filter((r) => r.ok).length, 1);
  assert.equal(rs.filter((r) => r.reason === "full").length, 2);
  assert.equal((await db.doc("codes/one-left").get()).data().usedCount, 1);
});
