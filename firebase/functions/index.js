// 벨라온 온라인 클래스 — 서버 함수
// remindExpiring: 매일 오전 9시(한국시간) 만료 임박 수강권에 리마인드 메일 발송 (설계 §5)
// redeemCode: 회원이 상세 페이지에서 수강 코드를 넣으면 확인 후 수강권 생성 (설계 §12)
// courseThumb: 강좌 썸네일 = 1차시 유튜브 썸네일을 대신 가져다줌(영상 ID 숨김)
// 메일 비밀번호(네이버 앱 비밀번호)는 Firebase 비밀값 저장소의 NAVER_SMTP_PASS 에만 있다 — 코드에 적지 않는다.
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import { runReminders } from "./reminder.js";
import { redeem } from "./redeem.js";
import { courseThumb } from "./thumb.js";
import { DEFAULT_THUMB } from "./core.js";   // 기본 그림은 사이트와 같은 한 곳(js/core.js 복사본)

initializeApp();
const SMTP_PASS = defineSecret("NAVER_SMTP_PASS");
const SMTP_USER = "bellaon_art@naver.com";

export const remindExpiring = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Asia/Seoul", region: "asia-northeast3", secrets: [SMTP_PASS] },
  async () => {
    const mailer = nodemailer.createTransport({
      host: "smtp.naver.com", port: 465, secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS.value() },
    });
    const r = await runReminders(getFirestore(), (msg) => mailer.sendMail(msg), Date.now());
    if (r.notReady) { logger.info("운영 기준(config/policy)이 아직 없어 건너뜀 — 관리자 페이지 첫 접속 전"); return; }
    logger.info("리마인드 결과", { 확인: r.checked, 발송: r.sent.length, 건너뜀: r.skipped, 실패: r.failed });
    if (r.failed.length) throw new Error(`리마인드 ${r.failed.length}건 실패`);   // 실패 시 로그에 오류로 남김
  },
);

// 로그인 정보(누가·이메일 인증 여부)는 Firebase 가 확인해 넣어준 값만 쓴다 — 회원이 보낸 값은 코드 글자뿐
export const redeemCode = onCall({ region: "asia-northeast3" }, async (req) => {
  const a = req.auth;
  const r = await redeem(getFirestore(), a && { uid: a.uid, email: a.token.email, emailVerified: a.token.email_verified === true },
    req.data?.code, Date.now());
  logger.info("수강 코드", { uid: a?.uid, 결과: r.ok ? "성공" : r.reason, 강좌: r.courseId });
  return r;
});

// /courseThumb?c=강좌ID → 그림(하루 동안 브라우저에 보관) · 없으면 사이트 기본 이미지로 넘김
const SITE = "https://www.bellaonart.com";
export const courseThumbImg = onRequest({ region: "asia-northeast3", cors: true }, async (req, res) => {
  try {
    const r = await courseThumb(getFirestore(), String(req.query.c || ""), (u) => fetch(u));
    if (r.image) {
      res.set("Cache-Control", "public, max-age=86400").type(r.type).send(r.image);
      return;
    }
  } catch (e) { logger.warn("썸네일 실패", { c: req.query.c, e: String(e?.message || e) }); }
  // 기본 이미지: 에뮬레이터(내 PC)에서 부르면 내 PC 사이트로, 실제 서버면 실제 사이트로
  const base = process.env.FUNCTIONS_EMULATOR === "true" ? "http://localhost:4399" : SITE;
  res.set("Cache-Control", "public, max-age=600").redirect(302, base + DEFAULT_THUMB);
});
