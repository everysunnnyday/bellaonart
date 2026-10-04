// =========================================================
// 모든 페이지 공통 (docs/03 §2 — 상단 메뉴·하단·카톡 버튼은 여기 한 곳에서만 그린다)
//  initShell({ active })  : 상단 메뉴(로그인/회원가입·KO/EN·휴대폰 메뉴) + 하단 + 카톡 버튼
//  watchUser(cb)          : 로그인 상태(페이지당 1회 확인, 여러 곳이 나눠 씀)
//  login(mode)            : 로그인 창(구글 + 이메일 로그인·가입·비밀번호 찾기)
//  toast / dialog         : 알림 · 확인창
// =========================================================
import {
  auth, db, IS_EMU, CONFIGURED, doc, getDoc, setDoc, updateDoc, serverTimestamp,
  GoogleAuthProvider, signInWithPopup, signInWithCredential, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, updateProfile, courseThumbUrl,
} from "./firebase.js?v=8";
import { t, tv, getLang, setLang, applyLang, onLangChange } from "./i18n.js?v=8";

export const KAKAO_CHANNEL = "https://pf.kakao.com/_JKTEn/chat";
export const PHONE = "010-7302-5170";

// 사업자 정보 — 하단(모든 페이지) 표시의 유일한 기준. 근거: 공정거래위원회 통신판매사업자 조회(2026-10-03 써니님 제공)
export const BIZ = {
  name: "벨라온(BELLAON)", nameEn: "BELLAON",
  ceo: "이보영", ceoEn: "Boyoung Lee",
  bizNo: "187-36-00951",
  mailOrderNo: "2024-전남광양-0088", mailOrderNoEn: "2024-Jeonnam Gwangyang-0088",
  addr: "전라남도 광양시 눈소9길 53-1, 2호", addrEn: "No. 2, 53-1 Nunso 9-gil, Gwangyang-si, Jeollanam-do",
  phone: PHONE,
  email: "bellaon_art@naver.com",
};
// 강좌 썸네일 — 관리자가 따로 넣은 그림이 있으면 그것, 비었거나 유튜브 썸네일 주소면
// 서버 함수가 대신 가져다주는 1차시 유튜브 썸네일(영상 ID 를 화면에 드러내지 않음). 못 가져오면 서버가 기본 그림으로 넘김.
export const thumbOf = (course, cid) => {
  const t = course?.thumb || "";
  return !t || /ytimg\.com|youtube\.com|youtu\.be/.test(t) ? courseThumbUrl(cid) : t;
};

// HTML 에 넣는 글자는 반드시 이걸 거친다(회원 이름 등으로 화면이 깨지거나 악용되는 것 방지)
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const tsMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : v ?? null);

// Firestore 수강권 → 계산용(시각은 ms 숫자)
export const toEnr = (id, d) => ({ id, ...d, startAt: tsMs(d.startAt), endAt: tsMs(d.endAt),
  extendedAt: tsMs(d.extendedAt), reminderSentFor: tsMs(d.reminderSentFor) });

// 운영 기준(config/policy) — 없으면 null (관리자 페이지에서 처음 한 번 만든다)
export async function loadPolicy() {
  const s = await getDoc(doc(db, "config/policy"));
  return s.exists() ? s.data() : null;
}

// ---------- 메뉴 정의 (메뉴 이름·주소의 유일한 기준, H7) ----------
const MENU = [
  ["about", "/about.html", "About"],
  ["art", "/art-design.html", "Art&amp;Design"],
  ["workshop", "/workshop.html", "Workshop"],
  ["shop", "/shop.html", "Shop"],
  ["contact", "/contact.html", "Contact"],
];

let shellOpts = { active: "" };

// 페이지마다 한 번 호출: <header id="site-header"></header> 와 <footer id="site-footer"></footer> 자리에 그린다
export function initShell({ active = "", kakao = true } = {}) {
  shellOpts = { active, kakao };
  document.documentElement.classList.add("js");
  renderHeader();
  renderFooter();
  if (kakao) renderKakao();
  applyLang();
  onLangChange(() => { renderHeader(); renderFooter(); renderKakao(); });
  const hd = $("#site-header");
  addEventListener("scroll", () => hd.classList.toggle("scrolled", scrollY > 10), { passive: true });
  watchUser(() => {});   // 상단 로그인 표시를 위해 로그인 상태 확인 시작
}

function renderHeader() {
  const hd = $("#site-header");
  if (!hd) return;
  const act = shellOpts.active;
  hd.className = "site-hd" + (act === "home" ? "" : " solid");
  const lang = getLang();
  hd.innerHTML = `
  <div class="nav">
    <a href="/" class="brand" aria-label="BELLAON ART"><img src="/images/logo.png" alt="BELLAON Art Flower Studio"></a>
    <nav class="menu" id="menu" aria-label="${t("주 메뉴", "aria.menu")}">
      <div class="menu-main">${MENU.map(([k, href, label]) => `<a href="${href}" class="${k === act ? "on" : ""}">${label}</a>`).join("")}</div>
      <div class="menu-side">
        <span class="hd-auth"></span>
        <span class="lang" role="group" aria-label="Language">
          <button type="button" data-lang="ko" class="${lang === "ko" ? "on" : ""}">KO</button><span>/</span><button type="button" data-lang="en" class="${lang === "en" ? "on" : ""}">EN</button>
        </span>
      </div>
    </nav>
    <button class="burger" type="button" aria-label="${t("메뉴 열기", "aria.burger")}" aria-expanded="false"><span></span><span></span><span></span></button>
  </div>`;
  const menu = hd.querySelector(".menu"), burger = hd.querySelector(".burger");
  burger.onclick = () => {
    const o = menu.classList.toggle("open");
    burger.classList.toggle("open", o);
    burger.setAttribute("aria-expanded", o);
  };
  menu.addEventListener("click", (e) => {
    const lb = e.target.closest("[data-lang]");
    if (lb) { setLang(lb.dataset.lang); return; }
    if (e.target.closest("a")) { menu.classList.remove("open"); burger.classList.remove("open"); }
  });
  renderAuthArea();
  const old = document.querySelector(".inapp-bar");
  old?.remove();
  if (isInApp()) {
    const bar = document.createElement("div");
    bar.className = "inapp-bar";
    bar.innerHTML = `${t("앱 안 브라우저에서는 구글 로그인이 되지 않아요.", "inapp.bar")} <button type="button">${t("외부 브라우저로 열기", "inapp.btn")}</button>`;
    bar.querySelector("button").onclick = showInAppGuide;
    hd.after(bar);
  }
}

function renderFooter() {
  const ft = $("#site-footer");
  if (!ft) return;
  const en = getLang() === "en";
  const item = (koLabel, key, val) => `<span><b>${t(koLabel, key)}</b> ${esc(val)}</span>`;
  ft.className = "site-ft";
  ft.innerHTML = `<div class="wrap">
    <span class="logo">BELLAON ART</span>
    <p class="biz">
      ${item("상호", "ft.name", en ? BIZ.nameEn : BIZ.name)}
      ${item("대표", "ft.ceo", en ? BIZ.ceoEn : BIZ.ceo)}
      ${item("사업자등록번호", "ft.bizNo", BIZ.bizNo)}
    </p>
    <p class="biz">
      ${item("통신판매업신고", "ft.mailOrder", en ? BIZ.mailOrderNoEn : BIZ.mailOrderNo)}
      ${item("주소", "ft.addr", en ? BIZ.addrEn : BIZ.addr)}
    </p>
    <p class="biz">
      ${item("전화", "ft.phone", BIZ.phone)}
      ${item("이메일", "ft.email", BIZ.email)}
    </p>
    <small>&copy; BELLAON ART. All rights reserved.</small>
  </div>`;
}

function renderKakao() {
  if (!shellOpts.kakao) return;
  let a = $(".kakao-float");
  if (!a) {
    a = document.createElement("a");
    a.className = "kakao-float";
    a.href = KAKAO_CHANNEL; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a);
  }
  a.setAttribute("aria-label", t("카카오톡으로 문의하기", "kakao.aria"));
  a.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#3C1E1E" d="M12 3C6.9 3 2.8 6.2 2.8 10.2c0 2.6 1.7 4.9 4.3 6.2-.2.7-.7 2.5-.8 2.9 0 0 0 .3.2.4.2.1.4 0 .4 0 .5-.1 2.8-1.9 3.6-2.5.4 0 .9.1 1.3.1 5.1 0 9.2-3.2 9.2-7.2S17.1 3 12 3z"/></svg><span class="kf-label">${t("카톡 문의", "kakao.label")}</span>`;
}

// ---------- 로그인 상태 (페이지당 한 번 확인 → 구독자들에게 전달) ----------
let authState = { ready: false, user: null, isAdmin: false };
const authSubs = new Set();
let authStarted = false;

const ss = {   // 세션 저장소(브라우저 탭을 닫으면 사라짐) — 못 쓰는 환경에선 조용히 무시
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* 무시 */ } },
};

export function watchUser(cb) {
  authSubs.add(cb);
  if (authState.ready) cb(authState);
  if (authStarted) return;
  authStarted = true;
  onAuthStateChanged(auth, async (user) => {
    let isAdmin = false;
    if (user) {
      // 회원 정보 갱신은 세션당 1회(공개 페이지를 넘길 때마다 쓰지 않도록)
      if (!ss.get("seen:" + user.uid)) {
        try { await upsertUser(user); ss.set("seen:" + user.uid, "1"); } catch (e) { console.warn("회원 정보 저장 실패", e); }
      }
      const cached = ss.get("adm:" + user.uid);
      if (cached != null) isAdmin = cached === "1";
      else {
        try { await getDoc(doc(db, "config/admins")); isAdmin = true; } catch { isAdmin = false; }   // 읽히면 관리자
        ss.set("adm:" + user.uid, isAdmin ? "1" : "0");
      }
    }
    authState = { ready: true, user, isAdmin };
    renderAuthArea();
    authSubs.forEach((fn) => fn(authState));
  });
  // 이메일 인증 전 회원이 다른 탭(메일)에서 인증하고 이 탭으로 돌아오면 → 인증 상태를 다시 읽고 새로고침
  document.addEventListener("visibilitychange", async () => {
    const u = auth.currentUser;
    if (document.visibilityState !== "visible" || !u || u.emailVerified) return;
    try {
      await u.reload();
      if (auth.currentUser?.emailVerified) { await auth.currentUser.getIdToken(true); location.reload(); }
    } catch { /* 네트워크 오류 등은 무시 — [인증을 마쳤어요] 버튼으로도 확인 가능 */ }
  });
}

// 상단 로그인 영역 — 메뉴 이름은 한/영 모두 영문(2026-10-03 써니님), 로그인하면 "이름님"으로 로그인 상태 표시
// (마이페이지에서 이름을 바꾸면 refreshAuthArea() 로 바로 다시 그린다)
export function refreshAuthArea() { renderAuthArea(); }
function renderAuthArea() {
  const area = $(".hd-auth");
  if (!area) return;
  const { user, isAdmin } = authState;
  const act = shellOpts.active;
  if (user) {
    const name = auth.currentUser?.displayName || (user.email || "").split("@")[0];
    area.innerHTML = `<span class="hd-name" title="${esc(name)}">${tv("{name}님", "nav.hello", { name: esc(name) })}</span>
      ${isAdmin ? `<a href="/admin/" class="${act === "admin" ? "on" : ""}">Admin</a>` : ""}
      <a href="/mypage.html" class="${act === "mypage" ? "on" : ""}">My Page</a>
      <button type="button" data-act="logout">Log out</button>`;
    area.querySelector("[data-act=logout]").onclick = logout;
  } else {
    area.innerHTML = `<button type="button" data-act="in">Log in</button>
      <button type="button" data-act="up">Sign up</button>`;
    area.querySelector("[data-act=in]").onclick = () => login("in");
    area.querySelector("[data-act=up]").onclick = () => login("up");
  }
}

async function upsertUser(user) {
  const ref = doc(db, "users", user.uid);
  const provider = user.providerData.some((p) => p.providerId === "google.com") ? "google" : "password";
  const base = { email: user.email || "", photoURL: user.photoURL || "", provider, lastLoginAt: serverTimestamp() };
  // 이메일 가입 직후엔 이름이 잠깐 비어 있다 → 빈 이름으로 덮어쓰지 않는다
  if (user.displayName) base.name = user.displayName;
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, base);
  else await setDoc(ref, { name: "", ...base, createdAt: serverTimestamp() });
}

// ---------- 앱 안 브라우저(카카오톡·인스타 등) ----------
// 구글은 앱 안 브라우저에서의 로그인을 막는다 → 외부 브라우저로 열도록 안내
const UA = navigator.userAgent;
export const isInApp = () => /KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|DaumApps|everytimeApp/i.test(UA);
const isKakao = () => /KAKAOTALK/i.test(UA);
const isAndroid = () => /Android/i.test(UA);

function openExternal() {
  const url = location.href;
  if (isKakao()) location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(url);
  else if (isAndroid()) location.href = "intent://" + url.replace(/^https?:\/\//, "") + "#Intent;scheme=https;package=com.android.chrome;end";
  else copyUrl();
}
async function copyUrl() {
  try { await navigator.clipboard.writeText(location.href); toast(t("주소를 복사했습니다. 사파리·크롬에 붙여넣어 열어 주세요.", "inapp.copied")); }
  catch { toast(t("오른쪽 아래(또는 위) 메뉴에서 '다른 브라우저로 열기'를 눌러 주세요.", "inapp.copyFail")); }
}
export async function showInAppGuide() {
  const ok = await dialog({
    title: t("외부 브라우저에서 열어 주세요", "inapp.title"),
    body: t("카카오톡·인스타그램 같은 앱 안의 화면에서는 <b>구글 로그인</b>이 막혀 있습니다.<br>크롬이나 사파리에서 열면 바로 로그인할 수 있어요.<br><span class='small muted'>이메일로 가입한 분은 이 화면에서도 이메일 로그인이 됩니다.</span>", "inapp.body"),
    ok: isKakao() || isAndroid() ? t("외부 브라우저로 열기", "inapp.open") : t("주소 복사하기", "inapp.copy"),
    cancel: t("닫기", "dlg.close"),
  });
  if (ok) openExternal();
}

// ---------- 로그인 창: 구글 + 이메일(로그인·회원가입·비밀번호 찾기) ----------
function authMsg(e) {
  const m = {
    "auth/email-already-in-use": ["이미 가입된 이메일입니다. 로그인하시거나, 구글로 가입하셨다면 [구글로 계속하기]를 눌러 주세요.", "err.exists"],
    "auth/invalid-credential": ["이메일 또는 비밀번호가 맞지 않습니다.", "err.cred"],
    "auth/wrong-password": ["이메일 또는 비밀번호가 맞지 않습니다.", "err.cred"],
    "auth/user-not-found": ["이메일 또는 비밀번호가 맞지 않습니다.", "err.cred"],
    "auth/invalid-email": ["이메일 주소 형식을 확인해 주세요.", "err.email"],
    "auth/weak-password": ["비밀번호는 8자 이상으로 정해 주세요.", "err.weak"],
    "auth/missing-password": ["비밀번호를 입력해 주세요.", "err.missingPw"],
    "auth/too-many-requests": ["시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.", "err.many"],
    "auth/network-request-failed": ["인터넷 연결을 확인해 주세요.", "err.net"],
    "auth/popup-blocked": ["팝업이 차단되었습니다. 주소창에서 팝업을 허용한 뒤 다시 눌러 주세요.", "err.popup"],
  }[e?.code];
  return m ? t(m[0], m[1]) : tv("처리하지 못했습니다. 잠시 후 다시 시도해 주세요. ({code})", "err.generic", { code: e?.code || e?.message });
}
export { authMsg };

async function googleLogin() {
  if (isInApp()) return showInAppGuide();
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export function login(startMode = "in") {
  if (!CONFIGURED) return toast(t("아직 회원 시스템 준비 중입니다.", "notReady"));
  const wrap = document.createElement("div");
  wrap.className = "dlg-wrap";
  wrap.innerHTML = `<div class="dlg auth-dlg" role="dialog" aria-modal="true">
    <h3>${t("벨라온 클래스 로그인", "auth.title")}</h3>
    <button type="button" class="btn google" data-a="google"><span class="g">G</span> ${t("구글로 계속하기", "auth.google")}</button>
    <div class="or"><span>${t("또는 이메일", "auth.or")}</span></div>
    <div class="auth-tabs"><button type="button" data-mode="in">${t("로그인", "auth.tabIn")}</button><button type="button" data-mode="up">${t("회원가입", "auth.tabUp")}</button></div>
    <form autocomplete="on" novalidate>
      <label class="field up-only" hidden>${t("이름", "auth.name")}<input name="name" autocomplete="name" maxlength="40"></label>
      <label class="field">${t("이메일", "auth.email")}<input name="email" type="email" autocomplete="email" required></label>
      <label class="field">${t("비밀번호", "auth.pw")}<input name="pw" type="password" autocomplete="current-password" minlength="8" required>
        <span class="hint up-only" hidden>${t("8자 이상", "auth.pwHint")}</span></label>
      <label class="field up-only" hidden>${t("비밀번호 확인", "auth.pw2")}<input name="pw2" type="password" autocomplete="new-password"></label>
      <p class="auth-err" role="alert"></p>
      <button type="submit" class="btn solid" data-a="submit"></button>
      <button type="button" class="link in-only" data-a="reset">${t("비밀번호를 잊으셨나요?", "auth.reset")}</button>
    </form>
    <button type="button" class="dlg-x" data-a="close" aria-label="${t("닫기", "dlg.close")}">×</button>
  </div>`;
  document.body.appendChild(wrap);
  const f = wrap.querySelector("form");
  const err = wrap.querySelector(".auth-err");
  let mode = "in";
  const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  const setMode = (m) => {
    mode = m; err.textContent = "";
    wrap.querySelectorAll(".auth-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
    wrap.querySelectorAll(".up-only").forEach((el) => { el.hidden = m !== "up"; });
    wrap.querySelectorAll(".in-only").forEach((el) => { el.hidden = m !== "in"; });
    f.pw.autocomplete = m === "up" ? "new-password" : "current-password";
    wrap.querySelector("[data-a=submit]").textContent = m === "up" ? t("가입하기", "auth.submitUp") : t("로그인", "auth.submitIn");
  };
  const busy = (on) => wrap.querySelectorAll("button").forEach((b) => { b.disabled = on; });

  wrap.addEventListener("click", async (e) => {
    if (e.target === wrap) return close();
    const tab = e.target.closest("[data-mode]");
    if (tab) return setMode(tab.dataset.mode);
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "close") return close();
    if (a === "google") {
      try { close(); await googleLogin(); }
      catch (x) { if (x.code !== "auth/popup-closed-by-user" && x.code !== "auth/cancelled-popup-request") toast(authMsg(x)); }
    }
    if (a === "reset") {
      const email = f.email.value.trim();
      if (!email) { err.textContent = t("가입한 이메일을 먼저 입력해 주세요.", "auth.resetNeedEmail"); f.email.focus(); return; }
      try { busy(true); await sendPasswordResetEmail(auth, email, resetReturn()); err.textContent = ""; toast(t("비밀번호 재설정 메일을 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.", "auth.resetSent"), 5000); }
      catch (x) { err.textContent = authMsg(x); }
      finally { busy(false); }
    }
  });

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = f.email.value.trim(), pw = f.pw.value;
    err.textContent = "";
    if (mode === "up") {
      const name = f.name.value.trim();
      if (!name) { err.textContent = t("이름을 입력해 주세요.", "auth.needName"); return; }
      if (pw.length < 8) { err.textContent = t("비밀번호는 8자 이상으로 정해 주세요.", "auth.pwShort"); return; }
      if (pw !== f.pw2.value) { err.textContent = t("비밀번호 확인이 일치하지 않습니다.", "auth.pwMismatch"); return; }
      try {
        busy(true);
        const cred = await createUserWithEmailAndPassword(auth, email, pw);
        await updateProfile(cred.user, { displayName: name });
        await upsertUser(cred.user);            // 이름을 회원 정보에 반영
        ss.set("seen:" + cred.user.uid, "1");
        await sendEmailVerification(cred.user, verifyReturn());
        close();
        dialog({ title: t("인증 메일을 보냈습니다", "auth.sentTitle"),
          body: tv("<b>{email}</b> 로 보낸 메일의 링크를 눌러 인증을 마쳐 주세요.<br><span class='small muted'>메일이 안 보이면 스팸함도 확인해 주세요. 인증 후 강의를 볼 수 있습니다.</span>", "auth.sentBody", { email: esc(email) }),
          ok: t("확인", "dlg.ok"), cancel: "" })
          .then(() => location.reload());
      } catch (x) { err.textContent = authMsg(x); busy(false); }
    } else {
      try { busy(true); await signInWithEmailAndPassword(auth, email, pw); close(); }
      catch (x) { err.textContent = authMsg(x); busy(false); }
    }
  });
  setMode(startMode === "up" ? "up" : "in");
  (startMode === "up" ? f.name : f.email).focus();
}
export const logout = () => signOut(auth);

// ---------- 메일 링크의 "돌아올 주소" ----------
// 인증·재설정 메일 링크 → Firebase 안내 페이지 → [계속] 버튼이 이 주소로 돌아온다(콘솔 설정 없이 동작).
// ※ 콘솔 '작업 URL 맞춤설정'(= /auth/action.html)이 저장되면 그 페이지가 직접 처리하고 같은 곳으로 보낸다.
//   (10-03 콘솔 저장이 계속 오류 → 이 방식으로 운영 · docs/04 §3-0)
const verifyReturn = () => ({ url: `${location.origin}/mypage.html?verified=1` });
const resetReturn = () => ({ url: `${location.origin}/mypage.html` });

// ---------- 이메일 인증 (이메일 가입 회원은 인증 전 강의 시청 불가 — 보안 규칙도 같은 조건) ----------
export const needsVerify = (user) => !!user && !user.emailVerified;
export function verifyGateHtml(user) {
  return `<div class="empty">이메일 인증이 필요합니다.<br>
    <b>${esc(user.email)}</b> 로 보낸 메일의 링크를 눌러 인증을 마쳐 주세요.<br><span class="small">(스팸함도 확인해 주세요)</span><br><br>
    <button type="button" class="btn solid" data-v="done">인증을 마쳤어요</button>
    <button type="button" class="btn" data-v="resend">인증 메일 다시 받기</button></div>`;
}
// 인증 안내 화면의 버튼 동작. 인증이 확인되면 페이지를 새로 연다.
export function bindVerifyGate(container, user) {
  container.onclick = async (e) => {
    const v = e.target.closest("[data-v]")?.dataset.v;
    if (v === "done") {
      await user.reload();
      if (auth.currentUser.emailVerified) { await auth.currentUser.getIdToken(true); location.reload(); }
      else toast("아직 인증이 확인되지 않았습니다. 메일의 링크를 눌러 주세요.");
    } else if (v === "resend") {
      try { await sendEmailVerification(user, verifyReturn()); toast("인증 메일을 다시 보냈습니다."); }
      catch (x) { toast(authMsg(x)); }
    }
  };
}

// 개발용(내 PC 에뮬레이터에서만): 구글 창 없이 테스트 계정으로 로그인 — 실제 사이트에는 존재하지 않음
if (IS_EMU) {
  window.__devLogin = (email, name) => signInWithCredential(auth, GoogleAuthProvider.credential(
    JSON.stringify({ sub: "g-" + email.replace(/[^a-z0-9]/gi, ""), email, email_verified: true, name: name || email.split("@")[0] })));
  window.__devLogout = () => signOut(auth);
}

// ---------- 알림 · 확인창 (브라우저 기본 confirm 대신) ----------
export function toast(msg, ms = 3200) {
  let box = $("#toast");
  if (!box) { box = document.createElement("div"); box.id = "toast"; box.setAttribute("role", "status"); document.body.appendChild(box); }
  box.textContent = msg;
  box.classList.add("show");
  clearTimeout(box._t);
  box._t = setTimeout(() => box.classList.remove("show"), ms);
}

// body 는 HTML(호출하는 쪽에서 esc 처리). 확인=true / 취소=false
export function dialog({ title, body = "", ok, cancel }) {
  ok = ok ?? t("확인", "dlg.ok");
  cancel = cancel ?? t("취소", "dlg.cancel");
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "dlg-wrap";
    wrap.innerHTML = `<div class="dlg" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3><div class="dlg-body">${body}</div>
      <div class="dlg-btns">${cancel ? `<button type="button" class="btn ghost" data-v="0">${esc(cancel)}</button>` : ""}
      <button type="button" class="btn solid" data-v="1">${esc(ok)}</button></div></div>`;
    const done = (v) => { wrap.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(false); };
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) return done(false);
      const b = e.target.closest("[data-v]");
      if (b) done(b.dataset.v === "1");
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(wrap);
    wrap.querySelector("[data-v='1']").focus();
  });
}

// ---------- 공개 페이지: 스크롤하면 서서히 나타나기 ----------
export function initReveal(root = document) {
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.12 })
    : null;
  root.querySelectorAll(".reveal:not(.in)").forEach((el) => (io ? io.observe(el) : el.classList.add("in")));
  // 안전장치: 처음 화면 안에 있는 것은 바로 보이게
  setTimeout(() => root.querySelectorAll(".reveal:not(.in)").forEach((el) => {
    if (el.getBoundingClientRect().top < innerHeight) el.classList.add("in");
  }), 300);
}

// 미설정(실제 Firebase 연결 전) 안내
export function notConfiguredHtml() {
  return `<div class="empty">온라인 클래스를 준비하고 있습니다.<br>문의: <a href="${KAKAO_CHANNEL}" target="_blank" rel="noopener">카카오톡 채널</a> · ${PHONE}</div>`;
}
