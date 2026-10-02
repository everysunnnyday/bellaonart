// 만료 리마인드 — "누구에게 무엇을 보낼지" 정하고 보낸 기록을 남기는 부분.
// 실제 발송(send)은 밖에서 넣어준다 → 네이버 비밀번호 없이도 에뮬레이터에서 끝까지 검사할 수 있다.
import { Timestamp } from "firebase-admin/firestore";
import { DAY, needsReminder, canExtend, daysLeft, fmtDate } from "./core.js";

export const SITE = "https://www.bellaonart.com";
export const FROM = '"벨라온 클래스" <bellaon_art@naver.com>';   // D13 발신 주소

const ms = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : t ?? null);

// send(msg) 는 메일 1통을 보내는 함수. 결과 요약을 돌려준다.
export async function runReminders(db, send, now) {
  const pol = (await db.doc("config/policy").get()).data();
  // 운영 기준이 아직 없으면 = 관리자 첫 접속 전(수강권도 있을 수 없음) → 오류가 아니라 '준비 전'으로 건너뜀
  if (!pol) return { checked: 0, sent: [], skipped: [], failed: [], notReady: true };

  const until = Timestamp.fromMillis(now + (pol.remindDays + 1) * DAY);
  const snap = await db.collection("enrollments")
    .where("status", "==", "active").where("endAt", "<=", until).get();

  const result = { checked: snap.size, sent: [], skipped: [], failed: [] };
  for (const d of snap.docs) {
    const raw = d.data();
    const e = { ...raw, startAt: ms(raw.startAt), endAt: ms(raw.endAt), reminderSentFor: ms(raw.reminderSentFor) };
    if (!needsReminder(e, pol, now)) continue;
    try {
      const user = (await db.doc(`users/${e.uid}`).get()).data();
      const course = (await db.doc(`courses/${e.courseId}`).get()).data();
      if (!user?.email) { result.skipped.push({ id: d.id, why: "이메일 없음" }); continue; }
      await send(buildMail(user, course, e, pol, now));
      await d.ref.update({ reminderSentFor: raw.endAt });   // 이 종료일 기준으로는 다시 안 보냄
      result.sent.push(d.id);
    } catch (err) {
      result.failed.push({ id: d.id, why: String(err?.message || err) });
    }
  }
  return result;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function buildMail(user, course, e, pol, now) {
  const title = course?.title || "온라인 클래스";
  const left = daysLeft(e.endAt, now);
  const leftTxt = left <= 1 ? "오늘 종료됩니다" : `${left}일 남았습니다`;   // 남은 일수는 오늘 포함
  const ext = canExtend(e, now);
  const myUrl = `${SITE}/mypage.html`;   // 마이페이지 > My Class
  const name = user.name || "수강생";

  const lines = [
    `${name}님, 안녕하세요. 벨라온입니다.`,
    "",
    `「${title}」 수강 기간이 ${leftTxt}. (종료일 ${fmtDate(e.endAt)})`,
    ext ? `지금 [마이페이지 > My Class]에서 1회 무료로 ${pol.extendDays}일 연장하실 수 있습니다.` : "",
    "",
    `마이페이지: ${myUrl}`,
    "",
    "문의: bellaon_art@naver.com · 010-7302-5170",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === ""));

  const html = `<div style="font-family:'Noto Sans KR',sans-serif;color:#4A423B;line-height:1.8;max-width:520px">
  <p style="font-family:Georgia,serif;letter-spacing:.2em;color:#7C8A68;font-size:13px">BELLAON CLASS</p>
  <p>${esc(name)}님, 안녕하세요. 벨라온입니다.</p>
  <p>「<b>${esc(title)}</b>」 수강 기간이 <b>${leftTxt}</b>.<br>종료일: ${fmtDate(e.endAt)}</p>
  ${ext ? `<p>지금 [마이페이지 > My Class]에서 <b>1회 무료로 ${pol.extendDays}일 연장</b>하실 수 있습니다.</p>` : ""}
  <p><a href="${myUrl}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#4A423B;color:#F2EEEB;text-decoration:none">My Class 바로가기</a></p>
  <p style="font-size:12px;color:#9C8B7D">문의: bellaon_art@naver.com · 010-7302-5170</p>
</div>`;

  return {
    from: FROM,
    to: user.email,
    subject: `[벨라온 클래스] 「${title}」 수강 기간이 ${leftTxt}`,
    text: lines.join("\n"),
    html,
  };
}
