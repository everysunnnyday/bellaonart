// 벨라온 온라인 클래스 — 서버 함수
// remindExpiring: 매일 오전 9시(한국시간) 만료 임박 수강권에 리마인드 메일 발송 (설계 §5)
// 메일 비밀번호(네이버 앱 비밀번호)는 Firebase 비밀값 저장소의 NAVER_SMTP_PASS 에만 있다 — 코드에 적지 않는다.
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import { runReminders } from "./reminder.js";

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
