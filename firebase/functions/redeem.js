// 수강 코드 사용 — "이 코드로 이 회원에게 수강권을 줘도 되는지" 판단하고 만드는 부분.
// 회원 브라우저는 수강권을 직접 만들 수 없으므로(firestore.rules) 서버 함수가 대신 만든다.
// index.js 의 redeemCode 가 로그인 정보를 넣어 부른다 → 에뮬레이터에서 이 파일만 따로 검사할 수 있다.
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import {
  CODE_RE, normCode, courseDays, enrollState, kstDateStr, startOfKstDay, endOfKstDay, defaultEndStr,
} from "./core.js";

export const MAX_FAILS = 5;            // 틀린 코드는 1시간에 5번까지 (아무 글자나 넣어 맞히기 방지)
export const FAIL_WINDOW = 3600000;

const ms = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : t ?? null);

// who = { uid, email, emailVerified } · 결과 = { ok:true, courseId, endAt } 또는 { ok:false, reason }
// reason: unverified · too-many · invalid · stopped · expired · full · used · course · enrolled · revoked · not-ready
export async function redeem(db, who, rawCode, now) {
  if (!who?.uid) return { ok: false, reason: "unauthenticated" };
  if (!who.emailVerified) return { ok: false, reason: "unverified" };

  const failRef = db.doc(`codeFails/${who.uid}`);
  const fail = (await failRef.get()).data();
  const inWindow = fail && now - ms(fail.since) < FAIL_WINDOW;
  if (inWindow && fail.count >= MAX_FAILS) return { ok: false, reason: "too-many" };

  const code = normCode(rawCode);
  const codeSnap = CODE_RE.test(code) ? await db.doc(`codes/${code}`).get() : null;
  if (!codeSnap?.exists) {
    // 없는 코드만 실패 횟수에 센다(진짜 코드를 아는 사람의 '마감·인원 초과'는 세지 않음)
    await failRef.set(inWindow ? { count: fail.count + 1, since: fail.since } : { count: 1, since: Timestamp.fromMillis(now) });
    return { ok: false, reason: "invalid" };
  }

  return db.runTransaction(async (tx) => {
    const cRef = db.doc(`codes/${code}`);
    const c = (await tx.get(cRef)).data();
    const useRef = db.doc(`codes/${code}/uses/${who.uid}`);
    const eRef = db.doc(`enrollments/${who.uid}_${c.courseId}`);
    const [used, course, policy, old] = await Promise.all([
      tx.get(useRef).then((s) => s.exists), tx.get(db.doc(`courses/${c.courseId}`)).then((s) => s.data()),
      tx.get(db.doc("config/policy")).then((s) => s.data()), tx.get(eRef).then((s) => s.data()),
    ]);
    const st = enrollState(old && { ...old, startAt: ms(old.startAt), endAt: ms(old.endAt) }, now);

    // 안내 순서: 코드 자체 → 강좌 → 회원의 현재 수강 상태 → 사용 이력 → 인원
    if (!c.active) return { ok: false, reason: "stopped" };
    if (c.expiresAt && now > ms(c.expiresAt)) return { ok: false, reason: "expired" };
    if (!course?.published) return { ok: false, reason: "course" };
    if (!policy) return { ok: false, reason: "not-ready" };
    if (st === "active" || st === "upcoming") return { ok: false, reason: "enrolled" };
    if (st === "revoked") return { ok: false, reason: "revoked" };                      // 관리자가 회수한 것은 코드로 되살리지 않음
    if (used) return { ok: false, reason: "used" };                                      // 코드 하나당 한 사람 1회
    if (c.maxUses != null && (c.usedCount || 0) >= c.maxUses) return { ok: false, reason: "full" };

    // 기간 = 오늘 시작, 강좌 기본 수강일(관리자 부여와 같은 계산 — core.js)
    const startStr = kstDateStr(now);
    const endAt = endOfKstDay(defaultEndStr(startStr, courseDays(course, policy)));
    tx.set(eRef, {
      uid: who.uid, courseId: c.courseId, status: "active",
      startAt: Timestamp.fromMillis(startOfKstDay(startStr)), endAt: Timestamp.fromMillis(endAt),
      extendedCount: 0, source: "code", code, grantedBy: `code:${code}`,
      grantedAt: FieldValue.serverTimestamp(), memo: `수강 코드 ${code}`,
    });
    tx.set(useRef, { uid: who.uid, email: who.email || "", at: FieldValue.serverTimestamp() });
    tx.update(cRef, { usedCount: FieldValue.increment(1) });
    return { ok: true, courseId: c.courseId, endAt };
  });
}
