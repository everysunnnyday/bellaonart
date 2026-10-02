// =========================================================
// 벨라온 클래스 — 순수 계산 (브라우저·메일 서버 공통 단일 기준)
// - 수강률·남은 일수·연장 가능 여부 등 "계산"은 전부 여기서만 한다.
// - 이 파일은 firebase/functions/core.js 로 자동 복사된다(firebase/scripts/sync-core.js).
//   복사본은 절대 직접 고치지 말 것 — 여기를 고치면 다음 배포·검사 때 함께 반영된다.
// - 운영 숫자(30일·10일·98%·1.5배속)의 기준은 Firestore config/policy 문서.
//   아래 DEFAULT_POLICY 는 그 문서가 아직 없을 때 "처음 만들 기본값"으로만 쓰인다.
// =========================================================

export const DAY = 86400000;
const KST = 9 * 3600000;

export const DEFAULT_POLICY = Object.freeze({
  defaultDays: 60,     // 코스 기본 수강기간(일) = 2개월, 시작일 포함
  remindDays: 10,      // 남은 기간(오늘 포함)이 이 일수가 되는 날 리마인드 메일 1회 (연장은 수강 중 상시)
  extendDays: 60,      // 1회 연장 일수 → 최대 60 + 60 = 120일
  completeRatio: 0.98, // 차시 완료 기준(실제 시청 비율)
  maxRate: 1.5,        // 수강으로 인정하는 최대 배속
});

// ---------- 날짜 (한국시간 달력 기준) ----------
export const kstDayNo = (ms) => Math.floor((ms + KST) / DAY);
export const kstDateStr = (ms) => new Date(ms + KST).toISOString().slice(0, 10);   // "2026-10-02"
export const startOfKstDay = (dateStr) => Date.parse(`${dateStr}T00:00:00.000+09:00`);
export const endOfKstDay = (dateStr) => Date.parse(`${dateStr}T23:59:59.999+09:00`);
export const addDaysStr = (dateStr, n) => kstDateStr(startOfKstDay(dateStr) + n * DAY);
// 기간은 시작일 포함 (60일: 10/2 시작 → 11/30 종료)
export const defaultEndStr = (startStr, days) => addDaysStr(startStr, days - 1);
// 남은 일수 = 오늘 포함 (달력 기준). 종료일 당일 = 1, 시작일 = 전체 일수.
// 화면 표시·리마인드 판정이 모두 이 정의 하나를 쓴다.
export const daysLeft = (endMs, nowMs) => kstDayNo(endMs) - kstDayNo(nowMs) + 1;
// 화면 표시 문구 (모든 페이지 공통). 영어 화면은 labels 로 문구만 바꿔 넘긴다({d} = 일수)
export const fmtLeft = (endMs, nowMs, labels = { today: "오늘 종료", days: "{d}일 남음" }) => {
  const d = daysLeft(endMs, nowMs);
  return d <= 1 ? labels.today : labels.days.replace("{d}", d);
};

// 수강권 상태. e = { status, startAt, endAt, extendedCount } (시각은 ms 숫자)
export function enrollState(e, now) {
  if (!e) return "none";
  if (e.status !== "active") return "revoked";
  if (now < e.startAt) return "upcoming";
  if (now > e.endAt) return "expired";
  return "active";
}

// 연장 가능 = 수강 중(시작~종료 사이)이면 언제든 + 아직 연장 안 함 (D17: 상시 1회)
// (보안 규칙의 연장 조건과 같은 정의 — firestore.rules enrollments 참고)
export function canExtend(e, now) {
  return enrollState(e, now) === "active"
    && (e.extendedCount || 0) === 0;
}

// 리마인드 메일 대상 = 수강 중 + remindDays일 이하 남음 + 이 종료일 기준으로 아직 안 보냄
export function needsReminder(e, policy, now) {
  return enrollState(e, now) === "active"
    && daysLeft(e.endAt, now) <= policy.remindDays
    && e.reminderSentFor !== e.endAt;
}

// ---------- 시청 구간 ----------
// 본 구간은 [시작0,끝0, 시작1,끝1, ...] 평평한 배열로 저장(Firestore는 배열 안의 배열 불가).
const r1 = (x) => Math.round(x * 10) / 10;

export function addSegment(seg, s, e) {
  if (!(e > s)) return seg || [];
  const pairs = [];
  for (let i = 0; i + 1 < (seg || []).length; i += 2) pairs.push([seg[i], seg[i + 1]]);
  pairs.push([r1(s), r1(e)]);
  pairs.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of pairs) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 0.2) last[1] = Math.max(last[1], b);   // 붙어 있거나 겹치면 합침
    else out.push([a, b]);
  }
  return out.flat();
}

export function watchedSec(seg, dur) {
  let t = 0;
  for (let i = 0; i + 1 < (seg || []).length; i += 2) {
    const a = Math.max(0, seg[i]);
    const b = dur > 0 ? Math.min(dur, seg[i + 1]) : seg[i + 1];
    if (b > a) t += b - a;
  }
  return t;
}

// 재생 위치 변화가 "이어서 본 것"인지 — 실제 흐른 시간 × 최대배속 + 여유 1초 이내만 인정(그 이상은 건너뛰기)
export function isContinuous(prevT, t, wallSec, maxRate) {
  const d = t - prevT;
  return d > 0 && d <= wallSec * maxRate + 1;
}

// 차시 하나의 상태. entry = progress.lessons[차시ID], lesson = { durationSec }
export function lessonStat(entry, lesson, policy) {
  const dur = lesson?.durationSec || 0;
  const w = entry ? watchedSec(entry.seg, dur) : 0;
  const ratio = dur > 0 ? Math.min(1, w / dur) : 0;
  const done = !!entry?.done || (dur > 0 && ratio >= policy.completeRatio);
  return { watched: w, ratio, done };
}

// 코스 전체. lessons = [{ id, durationSec }], progress = { lessons: {...} }
// 수강률 = 실제 시청 시간 합 ÷ 전체 영상 길이 (모든 차시 완료 시 100%)
export function courseStat(progress, lessons, policy) {
  let total = 0, watched = 0, doneCount = 0;
  for (const l of lessons) {
    const st = lessonStat(progress?.lessons?.[l.id], l, policy);
    total += l.durationSec || 0;
    watched += Math.min(st.watched, l.durationSec || 0);
    if (st.done) doneCount++;
  }
  const complete = lessons.length > 0 && doneCount === lessons.length;
  return { total, watched, doneCount, count: lessons.length, complete,
           ratio: complete ? 1 : (total > 0 ? watched / total : 0) };
}

// ---------- 표시 ----------
export function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}시간 ${m}분`;
  if (m) return s ? `${m}분 ${s}초` : `${m}분`;
  return `${s}초`;
}
export const fmtPct = (ratio) => `${Math.floor((ratio || 0) * 100)}%`;
export const fmtDate = (ms) => (ms ? kstDateStr(ms).replace(/-/g, ".") : "-");
