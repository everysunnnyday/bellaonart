// 계정 확인 (/auth/action.html?mode=…&oobCode=…) — 인증·재설정 메일 링크가 Firebase 기본 페이지 대신 여기로 온다
//  verifyEmail   이메일 인증 → 같은 브라우저에서 로그인돼 있으면 바로 마이페이지(로그인 상태)로
//  resetPassword 새 비밀번호 정하기 → 완료 후 로그인
//  recoverEmail  (이메일 변경 취소) 원래 이메일로 되돌리기
// ※ Firebase 콘솔 Authentication > 템플릿 > '작업 URL 맞춤설정' = https://www.bellaonart.com/auth/action.html
import {
  auth, CONFIGURED, applyActionCode, checkActionCode, verifyPasswordResetCode, confirmPasswordReset,
} from "./firebase.js";
import { initShell, $, esc, login, watchUser, notConfiguredHtml } from "./common.js";
import { t, tv } from "./i18n.js";

initShell({ kakao: false });
const box = $("#act");
const p = new URLSearchParams(location.search);
const mode = p.get("mode"), code = p.get("oobCode");

const show = (msg, btns = "") => { box.innerHTML = `<div class="empty">${msg}${btns ? `<div class="btns">${btns}</div>` : ""}</div>`; };
const loginBtn = () => `<button type="button" class="btn solid" id="goLogin">Log in</button>`;
// [Log in] 으로 로그인하면 마이페이지로 이동
let waitLogin = false;
const bindLogin = () => { const b = $("#goLogin"); if (b) b.onclick = () => { waitLogin = true; login("in"); }; };
watchUser(({ user }) => { if (waitLogin && user) location.href = "/mypage.html"; });
const linkErr = (e) => {
  console.warn(e);
  show(/expired|invalid/.test(e?.code || "")
    ? t("링크가 만료되었거나 이미 사용되었습니다.<br>필요하면 메일을 다시 받아 주세요.", "act.bad")
    : t("처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", "act.fail"), `<a class="btn" href="/">Home</a>`);
};

async function verifyEmail() {
  try { await applyActionCode(auth, code); }
  catch (e) {
    // 링크를 두 번 누른 경우: 이미 인증된 상태면 성공으로 본다
    await auth.authStateReady();
    if (auth.currentUser) await auth.currentUser.reload().catch(() => {});
    if (!auth.currentUser?.emailVerified) return linkErr(e);
  }
  await auth.authStateReady();
  if (auth.currentUser) {
    // 같은 브라우저에서 가입·로그인해 둔 상태 → 인증을 바로 반영하고 마이페이지로
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    location.replace("/mypage.html?verified=1");
    return;
  }
  show(t("이메일 인증이 완료되었습니다.<br>로그인하면 바로 강의를 볼 수 있습니다.", "act.verified"), loginBtn());
  bindLogin();
}

async function resetPassword() {
  let email;
  try { email = await verifyPasswordResetCode(auth, code); } catch (e) { return linkErr(e); }
  box.innerHTML = `<div class="card-box act-card">
    <h4>${t("새 비밀번호 정하기", "act.resetTitle")}</h4>
    <p class="small muted">${esc(email)}</p>
    <form class="form" id="rpForm" autocomplete="off">
      <label class="field">${t("새 비밀번호 (8자 이상)", "act.pw")}<input name="pw" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="field">${t("새 비밀번호 확인", "act.pw2")}<input name="pw2" type="password" autocomplete="new-password" required></label>
      <p class="code-msg err" id="rpErr" role="alert"></p>
      <div><button type="submit" class="btn solid">${t("비밀번호 바꾸기", "act.resetBtn")}</button></div>
    </form></div>`;
  $("#rpForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target, err = $("#rpErr");
    if (f.pw.value.length < 8) { err.textContent = t("비밀번호는 8자 이상으로 정해 주세요.", "auth.pwShort"); return; }
    if (f.pw.value !== f.pw2.value) { err.textContent = t("비밀번호 확인이 일치하지 않습니다.", "auth.pwMismatch"); return; }
    try {
      f.querySelector("button").disabled = true;
      await confirmPasswordReset(auth, code, f.pw.value);
      show(t("비밀번호를 바꿨습니다. 새 비밀번호로 로그인해 주세요.", "act.resetDone"), loginBtn());
      bindLogin();
    } catch (e) { f.querySelector("button").disabled = false; if (/weak/.test(e.code)) err.textContent = t("비밀번호는 8자 이상으로 정해 주세요.", "auth.pwShort"); else linkErr(e); }
  };
}

async function recoverEmail() {
  try {
    const info = await checkActionCode(auth, code);
    await applyActionCode(auth, code);
    show(tv("이메일 주소를 <b>{email}</b> 로 되돌렸습니다.", "act.recovered", { email: esc(info.data.email) }), loginBtn());
    bindLogin();
  } catch (e) { linkErr(e); }
}

if (!CONFIGURED) box.innerHTML = notConfiguredHtml();
else if (!code) show(t("올바르지 않은 주소입니다.", "act.noCode"), `<a class="btn" href="/">Home</a>`);
else ({ verifyEmail, resetPassword, recoverEmail }[mode] || (() => show(t("올바르지 않은 주소입니다.", "act.noCode"), `<a class="btn" href="/">Home</a>`)))();
