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
// 강좌의 기본 수강일 — 강좌에 따로 정한 값이 없으면 운영 기준(policy). 관리자 부여·수강 코드가 같이 쓴다.
export const courseDays = (course, policy) => course?.defaultDays || policy.defaultDays;

// 강좌 썸네일을 못 가져올 때 쓰는 기본 그림 — 사이트(common.js thumbOf)·서버 함수(courseThumbImg)가 함께 쓴다
export const DEFAULT_THUMB = "/images/class/paper-flower.jpg";

// 무료 강좌 = 수강료 칸이 "0" · "0원" · "무료" (2026-10-04 써니님: 0원 강좌는 회원 누구나 · 수강 기간 없음)
// ⚠ 보안 규칙(firestore.rules isFreeCourse)에 같은 규칙이 한 번 더 적혀 있다(규칙은 이 파일을 못 불러옴) — 바꾸면 둘 다
export const FREE_PRICE_RE = /^ *(0+ *원?|무료) *$/;
export const isFreePrice = (s) => FREE_PRICE_RE.test(String(s ?? ""));

// 수강료 표시 — 관리자가 쓴 그대로 두되 4자리 이상 숫자에 천 단위 쉼표, 숫자만 썼으면 "원"을 붙인다 · 무료 강좌는 freeLabel
// 예: "30000" → "30,000원" · "150000원" → "150,000원" · "150,000원" → 그대로 · "0"·"0원"·"무료" → "무료"
export const fmtPrice = (s, freeLabel = "무료") => {
  if (isFreePrice(s)) return freeLabel;
  const v = String(s ?? "").trim().replace(/\d{4,}/g, (d) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
  return /^\d[\d,]*$/.test(v) ? v + "원" : v;
};

// ---------- 수업 방식(온라인/오프라인) · 말머리 (2026-10-04 써니님) ----------
// 강좌 문서 modes = ["online"] · ["offline"] · 둘 다 — 관리자 체크박스. 값이 없던 옛 강좌 = 온라인(지금까지 모두 영상 강좌)
export const MODES = ["online", "offline"];
export const modesOf = (c) => (Array.isArray(c?.modes) && c.modes.length ? MODES.filter((m) => c.modes.includes(m)) : ["online"]);
// 오프라인만 = 강좌 상세에 강의실·수강 코드 대신 [카카오톡으로 수강 신청]만
export const isOfflineOnly = (c) => !modesOf(c).includes("online");

// 말머리 목록 — 새 말머리가 필요하면 여기에 한 줄 추가(id = 저장값 · ko/en = 표시). 관리자 선택지·모든 화면 표시가 이 목록 하나를 쓴다
export const HEADS = [
  { id: "free", ko: "무료", en: "Free" },
  { id: "paid", ko: "유료", en: "Paid" },
];
// 강좌의 말머리: course.head 가 비었으면 자동(수강료 0·0원·무료 → 무료, 그 밖의 수강료 → 유료, 수강료 비면 없음)
// "none" = 안 붙임 · HEADS 의 id = 관리자가 직접 고른 것
export function headOf(c) {
  const h = c?.head || "";
  if (h === "none") return null;
  if (h) return HEADS.find((x) => x.id === h) || null;
  if (!String(c?.priceLabel ?? "").trim()) return null;
  return HEADS.find((x) => x.id === (isFreePrice(c.priceLabel) ? "free" : "paid")) || null;
}

// 수강 코드 글자 규칙 — 영문 소문자·숫자·하이픈 4~30자, 대소문자 구분 없음(소문자로 바꿔 저장·비교)
// 관리자 화면(만들기)·서버 함수(확인)·보안 규칙이 같은 규칙을 쓴다.
export const CODE_RE = /^[a-z0-9-]{4,30}$/;
export const normCode = (s) => String(s ?? "").trim().toLowerCase();
// 남은 일수 = 오늘 포함 (달력 기준). 종료일 당일 = 1, 시작일 = 전체 일수.
// 화면 표시·리마인드 판정이 모두 이 정의 하나를 쓴다.
export const daysLeft = (endMs, nowMs) => kstDayNo(endMs) - kstDayNo(nowMs) + 1;

// 종료일(endAt)이 비어 있는(null) 수강권 = 기간 제한 없음 — 무료 강좌 수강권 · 관리자가 종료일을 비워 부여한 것
// 남은 일수·만료·연장·리마인드 판정에서 모두 빠진다(아래 함수들)
export const noEnd = (e) => e != null && e.endAt == null;

// 화면 표시 문구 (모든 페이지 공통). 영어 화면은 labels 로 문구만 바꿔 넘긴다({d} = 일수)
export const fmtLeft = (endMs, nowMs, labels = { today: "오늘 종료", days: "{d}일 남음", none: "기간 제한 없음" }) => {
  if (endMs == null) return labels.none || "기간 제한 없음";
  const d = daysLeft(endMs, nowMs);
  return d <= 1 ? labels.today : labels.days.replace("{d}", d);
};
// 수강 기간 표시: "2026.10.04 ~ 2026.12.02" · 종료일 없으면 "2026.10.04 ~"
export const fmtPeriod = (e) => `${fmtDate(e.startAt)} ~${e.endAt == null ? "" : " " + fmtDate(e.endAt)}`;
// 정렬용 종료 시각(종료일 없음 = 가장 늦음)
export const endSortKey = (e) => (e.endAt == null ? Number.MAX_SAFE_INTEGER : e.endAt);

// 수강권 상태. e = { status, startAt, endAt, extendedCount } (시각은 ms 숫자, endAt null = 기간 제한 없음)
export function enrollState(e, now) {
  if (!e) return "none";
  if (e.status !== "active") return "revoked";
  if (now < e.startAt) return "upcoming";
  if (e.endAt != null && now > e.endAt) return "expired";
  return "active";
}

// 연장 가능 = 수강 중(시작~종료 사이)이면 언제든 + 아직 연장 안 함 (D17: 상시 1회) · 기간 제한 없음은 연장할 것이 없음
// (보안 규칙의 연장 조건과 같은 정의 — firestore.rules enrollments 참고)
export function canExtend(e, now) {
  return enrollState(e, now) === "active"
    && !noEnd(e)
    && (e.extendedCount || 0) === 0;
}

// 리마인드 메일 대상 = 수강 중 + remindDays일 이하 남음 + 이 종료일 기준으로 아직 안 보냄 · 기간 제한 없음은 제외
export function needsReminder(e, policy, now) {
  return enrollState(e, now) === "active"
    && !noEnd(e)
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
