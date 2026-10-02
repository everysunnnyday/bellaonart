// 리마인드 메일 검사 (reminder.js) — 에뮬레이터 Firestore + 가짜 발송함
// 실행: firebase 폴더에서 npm test (emulators:exec 가 FIRESTORE_EMULATOR_HOST 를 넣어준다)
// ※ 이 파일은 배포에서 제외된다(firebase.json functions.ignore)
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { runReminders, buildMail } from "./reminder.js";
import { DEFAULT_POLICY, DAY, endOfKstDay, startOfKstDay } from "./core.js";

let db;
const NOW = Date.parse("2026-10-21T09:00:00+09:00");    // 매일 오전 9시 실행을 흉내
const end = (d) => Timestamp.fromMillis(endOfKstDay(d));
const e = (uid, endDate, o = {}) => ({ uid, courseId: "pub", status: "active",
  startAt: Timestamp.fromMillis(startOfKstDay("2026-10-02")), endAt: end(endDate), extendedCount: 0, ...o });

before(() => { initializeApp({ projectId: "demo-bellaon" }); db = getFirestore(); });
beforeEach(async () => {
  await db.recursiveDelete(db.collection("enrollments"));
  const b = db.batch();
  b.set(db.doc("config/policy"), { ...DEFAULT_POLICY });
  b.set(db.doc("courses/pub"), { title: "코스모스 페이퍼플라워", published: true });
  for (const u of ["a", "b", "c", "d", "f", "g"]) b.set(db.doc(`users/${u}`), { name: `수강생${u}`, email: `${u}@x.com` });
  b.set(db.doc("users/n"), { name: "메일없음", email: "" });
  // 남은 일수는 오늘(10/21) 포함
  b.set(db.doc("enrollments/a_pub"), e("a", "2026-10-30"));                       // 10일 남음 → 보냄
  b.set(db.doc("enrollments/b_pub"), e("b", "2026-10-31"));                       // 11일 남음 → 안 보냄
  b.set(db.doc("enrollments/c_pub"), e("c", "2026-10-21"));                       // 오늘 종료(1일) → 보냄
  b.set(db.doc("enrollments/d_pub"), e("d", "2026-10-20"));                       // 이미 끝남 → 안 보냄
  b.set(db.doc("enrollments/f_pub"), e("f", "2026-10-25", { status: "revoked" })); // 회수 → 안 보냄
  b.set(db.doc("enrollments/g_pub"), e("g", "2026-10-25", { extendedCount: 1 }));  // 연장 사용함 → 보냄(연장 안내 없이)
  b.set(db.doc("enrollments/n_pub"), e("n", "2026-10-25"));                       // 이메일 없음 → 건너뜀
  await b.commit();
});

test("대상만 보냄 · 보낸 기록 남김 · 같은 날 다시 돌려도 중복 없음", async () => {
  const box = [];
  const r = await runReminders(db, async (m) => { box.push(m); }, NOW);
  assert.deepEqual(r.sent.sort(), ["a_pub", "c_pub", "g_pub"]);
  assert.deepEqual(r.skipped.map((s) => s.id), ["n_pub"]);
  assert.equal(r.failed.length, 0);
  assert.deepEqual(box.map((m) => m.to).sort(), ["a@x.com", "c@x.com", "g@x.com"]);
  const a = (await db.doc("enrollments/a_pub").get()).data();
  assert.equal(a.reminderSentFor.toMillis(), a.endAt.toMillis());

  const again = [];
  const r2 = await runReminders(db, async (m) => { again.push(m); }, NOW + 3600000);
  assert.equal(again.length, 0, "같은 종료일 기준으로 두 번 보내면 안 됨");
  assert.equal(r2.sent.length, 0);
});

test("연장(+60일)해서 종료일이 바뀌면 새 종료일 기준 10일 남은 날 다시 보냄", async () => {
  await runReminders(db, async () => {}, NOW);
  const ref = db.doc("enrollments/a_pub");
  const cur = (await ref.get()).data();
  await ref.update({ endAt: Timestamp.fromMillis(cur.endAt.toMillis() + DEFAULT_POLICY.extendDays * DAY), extendedCount: 1 });   // 새 종료일 12/29
  const box = [];
  await runReminders(db, async (m) => { box.push(m); }, NOW + DAY);                       // 연장 다음 날
  await runReminders(db, async (m) => { box.push(m); }, Date.parse("2026-12-19T09:00:00+09:00"));   // 11일 남음
  assert.equal(box.filter((m) => m.to === "a@x.com").length, 0);
  await runReminders(db, async (m) => { box.push(m); }, Date.parse("2026-12-20T09:00:00+09:00"));   // 10일 남음
  assert.equal(box.filter((m) => m.to === "a@x.com").length, 1);
  assert.match(box.at(-1).subject, /10일 남았습니다/);
});

test("발송 실패는 기록하지 않음 → 다음 날 다시 시도", async () => {
  const r = await runReminders(db, async (m) => { if (m.to === "a@x.com") throw new Error("SMTP 오류"); }, NOW);
  assert.deepEqual(r.failed.map((f) => f.id), ["a_pub"]);
  assert.equal((await db.doc("enrollments/a_pub").get()).data().reminderSentFor, undefined);
  const box = [];
  await runReminders(db, async (m) => { box.push(m); }, NOW + DAY);
  assert.ok(box.some((m) => m.to === "a@x.com"));
});

test("운영 기준이 아직 없으면 오류 없이 건너뜀(관리자 첫 접속 전)", async () => {
  await db.doc("config/policy").delete();
  const box = [];
  const r = await runReminders(db, async (m) => { box.push(m); }, NOW);
  assert.equal(r.notReady, true);
  assert.equal(box.length, 0);
});

test("메일 내용: 발신 주소·남은 일수·종료일·연장 안내(연장 가능할 때만)·이름 안전 처리", () => {
  const pol = DEFAULT_POLICY;
  const en = { endAt: endOfKstDay("2026-10-30"), status: "active", startAt: 0, extendedCount: 0 };
  const m = buildMail({ name: "<b>홍길동</b>", email: "h@x.com" }, { title: "코스" }, en, pol, NOW);
  assert.equal(m.from, '"벨라온 클래스" <bellaon_art@naver.com>');
  assert.match(m.subject, /10일 남았습니다/);
  assert.match(m.text, /종료일 2026\.10\.30/);
  assert.match(m.text, /60일 연장/);
  assert.match(m.html, /&lt;b&gt;홍길동/);
  assert.doesNotMatch(m.html, /<b>홍길동/);
  const used = buildMail({ name: "a", email: "a@x.com" }, { title: "코스" }, { ...en, extendedCount: 1 }, pol, NOW);
  assert.doesNotMatch(used.text, /연장하실 수 있습니다/);
  const last = buildMail({ name: "a", email: "a@x.com" }, { title: "코스" }, en, pol, Date.parse("2026-10-30T09:00:00+09:00"));
  assert.match(last.subject, /오늘 종료됩니다/);
});
