// 계산 검사 (js/core.js) — 실행: npm test (firebase 폴더)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY, DEFAULT_POLICY as P, kstDateStr, startOfKstDay, endOfKstDay, defaultEndStr, daysLeft, fmtLeft,
  enrollState, canExtend, needsReminder, addSegment, watchedSec, isContinuous, lessonStat, courseStat, fmtDur,
  fmtPrice, isFreePrice, fmtPeriod, endSortKey, noEnd,
} from "../../js/core.js";

const at = (dateStr, hhmm = "09:00") => Date.parse(`${dateStr}T${hhmm}:00+09:00`);

test("수강료 표시: 천 단위 쉼표 · 숫자만 쓰면 '원' · 이미 쓴 쉼표·글자는 그대로", () => {
  assert.equal(fmtPrice("30000"), "30,000원");
  assert.equal(fmtPrice("150000원"), "150,000원");
  assert.equal(fmtPrice("150,000원"), "150,000원");
  assert.equal(fmtPrice("1200000"), "1,200,000원");
  assert.equal(fmtPrice("900"), "900원");
  assert.equal(fmtPrice("무료"), "무료");
  assert.equal(fmtPrice(" 30000 "), "30,000원");
  assert.equal(fmtPrice(""), "");
});

test("한국시간 날짜: UTC 15시 = 한국 다음날 0시", () => {
  assert.equal(kstDateStr(Date.parse("2026-10-01T15:00:00Z")), "2026-10-02");
  assert.equal(kstDateStr(Date.parse("2026-10-01T14:59:59Z")), "2026-10-01");
});

test("운영 기본값(D16): 기본 60일 + 1회 연장 60일 = 최대 120일", () => {
  assert.equal(P.defaultDays, 60);
  assert.equal(P.extendDays, 60);
  assert.equal(P.defaultDays + P.extendDays, 120);
});

test("기간은 시작일 포함: 60일 = 10/2 → 11/30, 연장 후 120일째 = 2027-01-29, 달·해 넘김", () => {
  assert.equal(defaultEndStr("2026-10-02", 60), "2026-11-30");
  assert.equal(defaultEndStr("2026-10-02", 120), "2027-01-29");
  assert.equal(kstDateStr(endOfKstDay("2026-11-30") + P.extendDays * DAY), "2027-01-29");   // 연장 = 종료일 +60일
  assert.equal(defaultEndStr("2026-12-15", 30), "2027-01-13");
  assert.equal(defaultEndStr("2026-10-02", 1), "2026-10-02");
});

test("남은 일수는 오늘 포함: 시작일 60 · 종료 전날 2 · 종료일 당일 1(오늘 종료)", () => {
  const end = endOfKstDay("2026-11-30");
  assert.equal(daysLeft(end, at("2026-10-02", "00:00")), 60);
  assert.equal(daysLeft(end, at("2026-11-29", "23:59")), 2);
  assert.equal(daysLeft(end, at("2026-11-30", "23:59")), 1);
  assert.equal(fmtLeft(end, at("2026-10-02")), "60일 남음");
  assert.equal(fmtLeft(end, at("2026-11-30")), "오늘 종료");
});

test("수강권 상태: 시작 전 / 수강 중 / 종료 / 회수 / 없음", () => {
  const e = { status: "active", startAt: startOfKstDay("2026-10-02"), endAt: endOfKstDay("2026-10-31") };
  assert.equal(enrollState(e, at("2026-10-01", "23:59")), "upcoming");
  assert.equal(enrollState(e, startOfKstDay("2026-10-02")), "active");
  assert.equal(enrollState(e, endOfKstDay("2026-10-31")), "active");
  assert.equal(enrollState(e, endOfKstDay("2026-10-31") + 1), "expired");
  assert.equal(enrollState({ ...e, status: "revoked" }, at("2026-10-10")), "revoked");
  assert.equal(enrollState(null, 0), "none");
});

test("연장 가능(D17): 수강 중이면 언제든 1회 — 시작 전·종료 후·연장 사용·회수는 불가 (보안 규칙과 같은 조건)", () => {
  const e = { status: "active", startAt: startOfKstDay("2026-10-02"), endAt: endOfKstDay("2026-11-30"), extendedCount: 0 };
  assert.equal(canExtend(e, startOfKstDay("2026-10-02") - 1), false);  // 시작 전
  assert.equal(canExtend(e, at("2026-10-02", "00:00")), true);          // 시작 첫날
  assert.equal(canExtend(e, at("2026-11-01")), true);                   // 30일 남음
  assert.equal(canExtend(e, at("2026-11-30", "23:59")), true);          // 종료일
  assert.equal(canExtend(e, endOfKstDay("2026-11-30") + 1), false);     // 종료 후
  assert.equal(canExtend({ ...e, extendedCount: 1 }, at("2026-11-25")), false);
  assert.equal(canExtend({ ...e, status: "revoked" }, at("2026-11-25")), false);
});

test("리마인드 대상: 10일 남은 날(오늘 포함)부터 · 같은 종료일엔 1번만 · 연장 후엔 새 종료일 기준 다시", () => {
  const e = { status: "active", startAt: startOfKstDay("2026-10-02"), endAt: endOfKstDay("2026-11-30") };
  assert.equal(needsReminder(e, P, at("2026-11-20")), false);
  assert.equal(needsReminder(e, P, at("2026-11-21")), true);
  assert.equal(needsReminder({ ...e, reminderSentFor: e.endAt }, P, at("2026-11-22")), false);
  const ext = { ...e, endAt: e.endAt + P.extendDays * DAY, reminderSentFor: e.endAt };   // 새 종료일 2027-01-29
  assert.equal(needsReminder(ext, P, at("2026-11-25")), false);      // 연장 직후엔 두 달 가까이 남음
  assert.equal(needsReminder(ext, P, at("2027-01-19")), false);      // 11일 남음
  assert.equal(needsReminder(ext, P, at("2027-01-20")), true);       // 10일 남음
  assert.equal(needsReminder({ ...e, status: "revoked" }, P, at("2026-11-25")), false);
});

test("본 구간 합치기: 이어 본 구간은 하나로, 다시 본 구간은 중복 없이", () => {
  let s = [];
  s = addSegment(s, 0, 10);
  s = addSegment(s, 10, 20);
  assert.deepEqual(s, [0, 20]);
  s = addSegment(s, 5, 15);                // 다시 봄
  assert.deepEqual(s, [0, 20]);
  s = addSegment(s, 50, 60);               // 떨어진 구간
  assert.deepEqual(s, [0, 20, 50, 60]);
  s = addSegment(s, 18, 55);               // 사이를 메움
  assert.deepEqual(s, [0, 60]);
  assert.deepEqual(addSegment(s, 10, 5), s); // 뒤로 간 건 무시
});

test("시청 시간: 영상 길이 밖은 잘라서 계산", () => {
  assert.equal(watchedSec([0, 20, 50, 60], 100), 30);
  assert.equal(watchedSec([90, 105], 100), 10);
  assert.equal(watchedSec([], 100), 0);
});

test("이어 봄 판정: 1초에 1.5배속까지 + 여유 1초, 큰 점프·되감기는 불인정", () => {
  assert.equal(isContinuous(10, 11, 1, 1.5), true);
  assert.equal(isContinuous(10, 11.5, 1, 1.5), true);
  assert.equal(isContinuous(10, 40, 1, 1.5), false);    // 건너뛰기
  assert.equal(isContinuous(40, 10, 1, 1.5), false);    // 되감기
  assert.equal(isContinuous(10, 10, 1, 1.5), false);    // 멈춤
});

test("차시 완료 기준 98%: 97.9% 미완료 · 98% 완료", () => {
  const l = { durationSec: 1000 };
  assert.equal(lessonStat({ seg: [0, 979] }, l, P).done, false);
  assert.equal(lessonStat({ seg: [0, 980] }, l, P).done, true);
  assert.equal(lessonStat({ seg: [0, 10], done: true }, l, P).done, true);   // 한 번 완료면 유지
  assert.equal(lessonStat(null, l, P).ratio, 0);
});

test("코스 수강률 = 시청 시간 합 ÷ 전체 길이, 전 차시 완료면 100%", () => {
  const ls = [{ id: "a", durationSec: 600 }, { id: "b", durationSec: 400 }];
  const half = courseStat({ lessons: { a: { seg: [0, 300] }, b: { seg: [0, 200] } } }, ls, P);
  assert.equal(half.ratio, 0.5);
  assert.equal(half.doneCount, 0);
  const all = courseStat({ lessons: { a: { seg: [0, 590] }, b: { seg: [0, 395] } } }, ls, P);
  assert.equal(all.complete, true);
  assert.equal(all.ratio, 1);
  assert.equal(courseStat(null, ls, P).ratio, 0);
  assert.equal(courseStat(null, [], P).complete, false);
});

test("무료 강좌 판정(0·0원·무료) · 수강료 표시 '무료'(영문은 넘긴 글자)", () => {
  for (const s of ["0", "0원", " 0 원 ", "00", "무료"]) assert.equal(isFreePrice(s), true, s);
  for (const s of ["", null, undefined, "10", "30000", "0.5", "무료 체험 10,000원", "10원"]) assert.equal(isFreePrice(s), false, String(s));
  assert.equal(fmtPrice("0"), "무료");
  assert.equal(fmtPrice("0원", "Free"), "Free");
  assert.equal(fmtPrice("30000"), "30,000원");
});

test("기간 제한 없음(종료일 null): 만료·연장·리마인드 없음 · 표시 '기간 제한 없음'", () => {
  const now = at("2026-10-04");
  const e = { status: "active", startAt: startOfKstDay("2026-10-04"), endAt: null, extendedCount: 0 };
  assert.equal(noEnd(e), true);
  assert.equal(enrollState(e, now), "active");
  assert.equal(enrollState(e, at("2099-12-31")), "active");
  assert.equal(enrollState({ ...e, status: "revoked" }, now), "revoked");
  assert.equal(enrollState({ ...e, startAt: startOfKstDay("2026-10-05") }, now), "upcoming");
  assert.equal(canExtend(e, now), false);
  assert.equal(needsReminder(e, P, now), false);
  assert.equal(fmtLeft(null, now), "기간 제한 없음");
  assert.equal(fmtLeft(null, now, { today: "x", days: "{d}", none: "No time limit" }), "No time limit");
  assert.equal(fmtPeriod(e), "2026.10.04 ~");
  assert.equal(fmtPeriod({ startAt: startOfKstDay("2026-10-04"), endAt: endOfKstDay("2026-12-02") }), "2026.10.04 ~ 2026.12.02");
  assert.ok(endSortKey(e) > endSortKey({ endAt: endOfKstDay("2099-12-31") }));
  // 기간 있는 수강권은 그대로
  const t = { ...e, endAt: endOfKstDay("2026-10-10") };
  assert.equal(noEnd(t), false);
  assert.equal(canExtend(t, now), true);
  assert.equal(needsReminder(t, P, now), true);
});

test("시간 표시", () => {
  assert.equal(fmtDur(1812), "30분 12초");
  assert.equal(fmtDur(3725), "1시간 2분");
  assert.equal(fmtDur(45), "45초");
});
