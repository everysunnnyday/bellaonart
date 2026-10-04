// 마이페이지 (/mypage.html?tab=class|profile) — docs/03 H4·§5
//  [My Class]     내 수강권 · 수강률 · 남은 기간 · 1회 무료 연장 (예전 내 강의실)
//  [개인정보 수정] 이름 · 연락처 · 비밀번호 변경(이메일 가입자) · 회원 탈퇴
import {
  auth, db, doc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where, orderBy,
  serverTimestamp, Timestamp, updateProfile, EmailAuthProvider, reauthenticateWithCredential,
  reauthenticateWithPopup, GoogleAuthProvider, updatePassword, deleteUser, signOut,
} from "./firebase.js?v=11";
import {
  initShell, watchUser, esc, $, toEnr, loadPolicy, login, toast, dialog, authMsg,
  KAKAO_CHANNEL, thumbOf, needsVerify, verifyGateHtml, bindVerifyGate, refreshAuthArea,
} from "./common.js?v=11";
import { enrollState, canExtend, daysLeft, fmtLeft, fmtPeriod, endSortKey, noEnd, courseStat, fmtPct, fmtDate, DAY } from "./core.js?v=11";
import { mountCategories } from "./course-list.js?v=11";
import { patternsOf, openPatternDialog } from "./files.js?v=11";

initShell({ active: "mypage", kakao: false });
const box = $("#my");
const params = new URLSearchParams(location.search);
let tab = params.get("tab") === "profile" ? "profile" : "class";
// 인증 메일 링크로 인증을 마치고 넘어온 경우(Firebase 안내 페이지 [계속] 또는 /auth/action.html)
// → 브라우저가 기억한 '미인증' 상태를 새로 읽은 뒤 안내 한 번 · 주소에서 표시를 지운다
let justVerified = params.get("verified") === "1";
if (justVerified) history.replaceState(null, "", location.pathname);
async function afterVerifyLink(user) {
  justVerified = false;
  if (user && !user.emailVerified) {
    try { await user.reload(); if (auth.currentUser?.emailVerified) await auth.currentUser.getIdToken(true); } catch { /* 아래 안내로 충분 */ }
  }
  toast(user ? "이메일 인증이 완료되었습니다. 이제 강의를 볼 수 있습니다." : "이메일 인증이 완료되었습니다. 로그인하면 강의를 볼 수 있습니다.", 5000);
}
let me = null, policy = null, items = [];

const STATE_TXT = { active: "수강 중", upcoming: "시작 전", expired: "기간 종료", revoked: "수강권 회수" };
const isPasswordUser = (u) => u.providerData.some((p) => p.providerId === "password");

document.querySelector(".tabs").onclick = (e) => {
  const b = e.target.closest("[data-tab]");
  if (!b || b.dataset.tab === tab) return;
  tab = b.dataset.tab;
  history.replaceState(null, "", tab === "profile" ? "?tab=profile" : location.pathname);
  show();
};

function show() {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  if (!me) return;
  if (tab === "profile") renderProfile();
  else if (needsVerify(me)) { box.innerHTML = verifyGateHtml(me); bindVerifyGate(box, me); }
  else { box.onclick = null; box.innerHTML = `<div class="empty">불러오는 중…</div>`; loadClass().catch((e) => { console.error(e); box.innerHTML = `<div class="empty">불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>`; }); }
}

// =========================================================
// My Class
// =========================================================
async function loadClass() {
  policy = await loadPolicy();
  const s = await getDocs(query(collection(db, "enrollments"), where("uid", "==", me.uid)));
  const now = Date.now();
  items = await Promise.all(s.docs.map(async (d) => {
    const e = toEnr(d.id, d.data());
    const state = enrollState(e, now);
    const course = (await getDoc(doc(db, "courses", e.courseId)).catch(() => null))?.data() || { title: "(삭제된 강좌)" };
    const prog = (await getDoc(doc(db, "progress", `${me.uid}_${e.courseId}`)).catch(() => null))?.data() || null;
    let stat = null;
    if (state === "active" && policy) {   // 수강률은 수강 중인 강좌만 계산
      const ls = await getDocs(query(collection(db, "courses", e.courseId, "lessons"), orderBy("order"))).catch(() => null);
      if (ls) stat = courseStat(prog, ls.docs.map((x) => ({ id: x.id, ...x.data() })), policy);
    }
    const doneCount = Object.values(prog?.lessons || {}).filter((l) => l.done).length;
    return { e, state, course, prog, stat, doneCount };
  }));
  const rank = { active: 0, upcoming: 1, expired: 2, revoked: 3 };
  items.sort((a, b) => rank[a.state] - rank[b.state] || endSortKey(b.e) - endSortKey(a.e));
  if (tab === "class") renderClass();
}

function renderClass() {
  const now = Date.now();
  // 수강 중(또는 시작 전)인 강좌가 없으면 — 기간 끝난 강좌만 있을 때 포함 — 문의 버튼 + Workshop 목록
  // (이때는 지난 강좌 카드의 [수강 문의] 버튼을 빼고 아래 큰 버튼 하나만 둔다 — 중복 방지)
  const live = items.some((it) => it.state === "active" || it.state === "upcoming");
  const browse = live ? "" : `<div class="my-empty">
      <p>${items.length ? "지금 수강 중인 강좌가 없습니다." : "아직 수강 중인 강좌가 없습니다."}</p>
      <a class="btn solid" href="${KAKAO_CHANNEL}" target="_blank" rel="noopener">카카오톡으로 수강 문의</a>
    </div>
    <div class="my-browse"><h2 class="section-title">Workshop</h2><span class="rule"></span><div id="wsList"></div></div>`;
  box.innerHTML = `${items.length ? `<div class="my-list">${items.map(({ e, state, course, prog, stat, doneCount }, i) => {
    const period = fmtPeriod(e);   // 기간 제한 없음 = "2026.10.04 ~"
    const leftTxt = state === "active" ? fmtLeft(e.endAt, now) : STATE_TXT[state];
    const warn = state === "active" && policy && !noEnd(e) && daysLeft(e.endAt, now) <= policy.remindDays;
    const pct = stat ? stat.ratio : null;
    const complete = stat?.complete || !!prog?.completedAt;
    const ext = policy && canExtend(e, now);
    return `<div class="my-item">
      <div class="thumb" style="background-image:url('${esc(thumbOf(course, e.courseId))}')"></div>
      <div>
        <h3>${esc(course.title)}</h3>
        <div class="line">
          <span class="badge ${warn ? "warn" : state === "active" ? "active" : ""}">${esc(leftTxt)}</span>
          ${complete ? `<span class="badge done">수강 완료</span>` : ""}
          <span>${period}</span>
          ${e.extendedCount ? `<span>연장 사용함</span>` : ""}
        </div>
        ${pct != null ? `<div class="bar ${complete ? "done" : ""}"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>
          <div class="line"><span>수강률 ${fmtPct(pct)}</span><span>완료 ${stat.doneCount}/${stat.count}강</span></div>`
          : `<div class="line"><span>완료한 차시 ${doneCount}개</span></div>`}
      </div>
      <div class="acts">
        ${state === "active" ? `<a class="btn solid" href="/class/watch.html?c=${encodeURIComponent(e.courseId)}">강좌 보기</a>` : ""}
        ${ext ? `<button type="button" class="btn sage" data-ext="${i}">수강 연장 +${policy.extendDays}일 (무료)</button>` : ""}
        ${state === "active" && patternsOf(course).length ? `<button type="button" class="btn" data-pat="${i}">도안 내려받기</button>` : ""}
        ${(state === "expired" || state === "revoked") && live ? `<a class="btn" href="${KAKAO_CHANNEL}" target="_blank" rel="noopener">수강 문의</a>` : ""}
      </div>
    </div>`;
  }).join("")}</div>` : ""}${browse}`;
  box.querySelectorAll("[data-ext]").forEach((b) => { b.onclick = () => extend(items[+b.dataset.ext]); });
  // 도안 = [도안 내려받기] 하나 → 강좌 상세·강의실과 같은 팝업 목록(js/files.js)
  box.querySelectorAll("[data-pat]").forEach((b) => { const it = items[+b.dataset.pat]; b.onclick = () => openPatternDialog(it.e.courseId, it.course); });
  if (!live) mountCategories($("#wsList"), { info: true });   // Workshop 페이지와 같은 카테고리 카드(js/course-list.js)
}

async function extend(it) {
  const newEnd = it.e.endAt + policy.extendDays * DAY;
  const ok = await dialog({
    title: "수강 기간 연장",
    body: `「${esc(it.course.title)}」 수강 기간을 <b>${policy.extendDays}일</b> 연장합니다.<br>
      종료일: ${fmtDate(it.e.endAt)} → <b>${fmtDate(newEnd)}</b><br>
      <span class="muted small">연장은 강좌마다 1회만 무료로 가능합니다.</span>`,
    ok: "연장하기",
  });
  if (!ok) return;
  try {
    await updateDoc(doc(db, "enrollments", it.e.id), {
      endAt: Timestamp.fromMillis(newEnd), extendedCount: 1, extendedAt: serverTimestamp(),
    });
    toast(`연장되었습니다. 새 종료일 ${fmtDate(newEnd)}`);
    await loadClass();
  } catch (err) {
    console.error(err);
    toast("연장하지 못했습니다. 이미 연장했거나 수강 기간이 아닙니다.");
  }
}

// =========================================================
// 개인정보 수정 (docs/03 §5)
// =========================================================
async function renderProfile() {
  box.onclick = null;
  const snap = await getDoc(doc(db, "users", me.uid)).catch(() => null);
  const u = snap?.data() || {};
  const pwUser = isPasswordUser(me);
  box.innerHTML = `<div class="profile">
    <div class="card-box">
      <h4>기본 정보</h4>
      <form class="form" id="pfForm" autocomplete="on">
        <label class="field">이메일<input value="${esc(me.email)}" disabled></label>
        <label class="field">이름<input name="name" value="${esc(u.name || me.displayName || "")}" maxlength="40" required autocomplete="name"></label>
        <label class="field">연락처 (선택)<input name="phone" type="tel" value="${esc(u.phone || "")}" maxlength="20" placeholder="010-0000-0000" autocomplete="tel"></label>
        <div><button type="submit" class="btn solid">저장</button></div>
      </form>
    </div>
    ${pwUser ? `<div class="card-box">
      <h4>비밀번호 변경</h4>
      <form class="form" id="pwForm" autocomplete="off">
        <label class="field">현재 비밀번호<input name="cur" type="password" autocomplete="current-password" required></label>
        <label class="field">새 비밀번호 (8자 이상)<input name="next" type="password" autocomplete="new-password" minlength="8" required></label>
        <label class="field">새 비밀번호 확인<input name="next2" type="password" autocomplete="new-password" required></label>
        <div><button type="submit" class="btn solid">비밀번호 변경</button></div>
      </form>
    </div>` : `<div class="card-box"><h4>비밀번호</h4><p class="small muted">구글 계정으로 가입하셨습니다. 비밀번호는 구글에서 관리됩니다.</p></div>`}
    <div class="card-box danger">
      <h4>회원 탈퇴</h4>
      <p class="small muted">탈퇴하면 이름·이메일·연락처가 삭제되고 다시 로그인할 수 없습니다.<br>수강 기록은 관리 목적으로 남지만 회원님을 알아볼 수 있는 정보는 지워집니다.</p>
      ${pwUser ? `<label class="field" style="margin-top:12px">비밀번호 확인<input id="delPw" type="password" autocomplete="current-password"></label>` : ""}
      <div style="margin-top:14px"><button type="button" class="btn danger" id="delBtn">회원 탈퇴</button></div>
    </div>
  </div>`;

  $("#pfForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, name = f.name.value.trim(), phone = f.phone.value.trim();
    if (!name) return toast("이름을 입력해 주세요.");
    if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) return toast("연락처는 숫자와 - 만 입력해 주세요.");
    try {
      await updateProfile(me, { displayName: name });
      await updateDoc(doc(db, "users", me.uid), { name, phone });
      refreshAuthArea();   // 상단 "이름님" 바로 바꾸기
      toast("저장했습니다.");
    } catch (err) { console.error(err); toast("저장하지 못했습니다: " + (err.code || err.message)); }
  };

  if (pwUser) $("#pwForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.next.value.length < 8) return toast("새 비밀번호는 8자 이상으로 정해 주세요.");
    if (f.next.value !== f.next2.value) return toast("새 비밀번호 확인이 일치하지 않습니다.");
    try {
      await reauthenticateWithCredential(me, EmailAuthProvider.credential(me.email, f.cur.value));
      await updatePassword(me, f.next.value);
      f.reset();
      toast("비밀번호를 바꿨습니다.");
    } catch (err) { toast(err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" ? "현재 비밀번호가 맞지 않습니다." : authMsg(err)); }
  };

  $("#delBtn").onclick = async () => {
    const ok = await dialog({ title: "회원 탈퇴", body: "정말 탈퇴하시겠어요?<br><span class='small muted'>탈퇴 후에는 되돌릴 수 없습니다.</span>", ok: "탈퇴하기" });
    if (!ok) return;
    try {
      // 계정 삭제는 최근 로그인 확인이 필요 → 먼저 본인 확인
      if (pwUser) await reauthenticateWithCredential(me, EmailAuthProvider.credential(me.email, $("#delPw").value));
      else await reauthenticateWithPopup(me, new GoogleAuthProvider());
      await deleteDoc(doc(db, "users", me.uid));   // 이름·이메일·연락처 삭제
      await deleteUser(me);                         // 로그인 계정 삭제
      try { sessionStorage.clear(); } catch { /* 무시 */ }
      await dialog({ title: "탈퇴가 완료되었습니다", body: "그동안 이용해 주셔서 감사합니다.", ok: "확인", cancel: "" });
      location.href = "/";
    } catch (err) {
      console.error(err);
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/missing-password") toast("비밀번호를 확인해 주세요.");
      else if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") toast("탈퇴하지 못했습니다: " + (err.code || err.message));
      if (!auth.currentUser) await signOut(auth).catch(() => {});
    }
  };
}

// =========================================================
watchUser(async ({ user }) => {
  if (justVerified) await afterVerifyLink(user);
  me = user;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  if (!user) {
    box.innerHTML = `<div class="empty">로그인하면 My Class 와 개인정보를 볼 수 있습니다.<br><br>
      <button type="button" class="btn solid" id="loginBtn">로그인 / 회원가입</button></div>`;
    $("#loginBtn").onclick = () => login("in");
    return;
  }
  show();
});
