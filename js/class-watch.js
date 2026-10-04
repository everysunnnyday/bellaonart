// 강좌 상세 · 강의실 (/class/watch.html?c=코스ID[&l=차시ID])
// - 누구나: 강좌 상세(소개·가격·목차·수강 기간) — 목차는 공개 칸(lessons)만 읽는다(영상 주소 없음)
// - 수강권 있는 회원: 강의실(영상 시청 · 실제 시청 구간 기록 · 수강률) — 영상 주소(videos)는 이때만 읽힌다
// - 수강권 없는 회원: [수강 신청] 영역(카카오톡) + [수강 코드] 영역(서버 함수 redeemCode 가 확인 후 수강권 생성) — 두 영역을 나눠 보여 줌
// - 무료 강좌(수강료 0·0원·무료): 인증된 회원이 열면 수강권(기간 제한 없음)을 자동으로 받고 바로 강의실 — claimFree
import {
  db, CONFIGURED, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, orderBy, serverTimestamp, Timestamp, redeemCode,
} from "./firebase.js?v=6";
import {
  initShell, watchUser, esc, $, toEnr, loadPolicy, login, toast,
  notConfiguredHtml, KAKAO_CHANNEL, thumbOf, needsVerify, verifyGateHtml, bindVerifyGate,
} from "./common.js?v=6";
import { enrollState, fmtLeft, fmtPeriod, lessonStat, courseStat, fmtDur, fmtPct, fmtDate, courseDays, fmtPrice, isFreePrice,
  startOfKstDay, kstDateStr } from "./core.js?v=6";
import { LessonTracker } from "./youtube.js?v=6";
import { t, tv, onLangChange } from "./i18n.js?v=6";

initShell({ active: "workshop" });
const app = $("#app");
const params = new URLSearchParams(location.search);
const cid = params.get("c");

let me = null, course = null, enr = null, policy = null, lessons = [], progress = null;
let tracker = null, curId = null, preview = false;
let detailState = null;   // 상세 화면이 떠 있을 때의 상태(언어를 바꾸면 다시 그리기 위해)

// ---------- 강좌를 못 열 때 ----------
function notice(msg, btns = "") {
  detailState = null;
  app.innerHTML = `<div class="gate"><p class="state">${msg}</p><div class="btns">${btns}</div></div>`;
}
const wsBtn = () => `<a class="btn" href="/workshop.html">Workshop</a>`;
// 수강 문의는 카카오톡 하나만(전화번호는 노출하지 않음 — 2026-10-03 써니님)
const askBtns = () => `<a class="btn solid" href="${KAKAO_CHANNEL}" target="_blank" rel="noopener">${t("카카오톡으로 수강 문의", "cd.askKakao")}</a>`;
// 수강 신청 영역의 버튼(2026-10-04 써니님) — 문의(오류·회수 안내)와 신청을 구분
const applyBtn = () => `<a class="btn solid" href="${KAKAO_CHANNEL}" target="_blank" rel="noopener">${t("카카오톡으로 수강 신청", "cd.applyKakao")}</a>`;

// 수강 코드 결과 안내 (사유 = firebase/functions/redeem.js)
const REDEEM_MSG = {
  unauthenticated: ["로그인 후 이용해 주세요.", "cd.r.auth"],
  unverified: ["이메일 인증을 마친 뒤 이용해 주세요.", "cd.r.unverified"],
  "too-many": ["코드를 여러 번 잘못 입력했습니다. 1시간 뒤에 다시 시도해 주세요.", "cd.r.many"],
  invalid: ["코드를 다시 확인해 주세요.", "cd.r.invalid"],
  stopped: ["사용이 중지된 코드입니다.", "cd.r.stopped"],
  expired: ["사용 기간이 지난 코드입니다.", "cd.r.expired"],
  full: ["사용 인원이 마감된 코드입니다.", "cd.r.full"],
  used: ["이미 사용한 코드입니다.", "cd.r.used"],
  course: ["지금은 신청할 수 없는 강좌입니다.", "cd.r.course"],
  enrolled: ["이미 수강 중인 강좌입니다.", "cd.r.enrolled"],
  revoked: ["수강권이 회수된 강좌입니다. 문의해 주세요.", "cd.r.revoked"],
  "not-ready": ["아직 수강 신청을 받을 준비가 되지 않았습니다. 문의해 주세요.", "cd.r.notReady"],
};
const redeemMsg = (reason) => t(...(REDEEM_MSG[reason] || ["처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", "cd.r.fail"]));

// ---------- 강좌 상세 (수강권이 없을 때 · 비회원 포함) ----------
// state: login · verify · none · expired · upcoming · revoked
function renderDetail(state) {
  detailState = state;
  const total = lessons.reduce((s, l) => s + (l.durationSec || 0), 0);
  const days = policy && courseDays(course, policy);
  const free = isFreePrice(course.priceLabel);
  const facts = [
    course.priceLabel ? [t("수강료", "cd.price"), esc(fmtPrice(course.priceLabel, t("무료", "cd.free")))] : null,
    lessons.length ? [t("구성", "cd.parts"), tv("{n}강 · 총 {d}", "cd.partsVal", { n: lessons.length, d: fmtDur(total) })] : null,
    free ? [t("수강 기간", "cd.period"), t("기간 제한 없음", "cd.periodFree")]
      : days ? [t("수강 기간", "cd.period"), tv("{d}일 · 1회 무료 연장 +{e}일", "cd.periodVal", { d: days, e: policy.extendDays })] : null,
    course.materials ? [t("준비물", "cd.materials"), esc(course.materials)] : null,   // 관리자 입력(강좌마다)
  ].filter(Boolean);
  const desc = course.description || "";

  app.innerHTML = `<article class="detail">
    <div class="d-top">
      <div class="d-thumb" style="background-image:url('${esc(thumbOf(course, cid))}')"></div>
      <div class="d-info">
        <span class="eyebrow">Online Class</span>
        <h1>${esc(course.title)}</h1>
        ${course.summary ? `<p class="d-sum">${esc(course.summary)}</p>` : ""}
        ${facts.length ? `<dl class="d-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""}
        <div class="d-act" id="act"></div>
      </div>
    </div>
    ${desc ? `<section class="d-sec"><h2>${t("강좌 소개", "cd.about")}</h2><p class="d-desc">${esc(desc)}</p></section>` : ""}
    <section class="d-sec"><h2>${t("강의 목차", "cd.outline")}</h2>
      ${lessons.length ? `<ol class="d-outline">${lessons.map((l, i) => `<li><span class="no">${i + 1}</span>
        <span class="t">${esc(l.title)}</span><span class="dur">${fmtDur(l.durationSec)}</span></li>`).join("")}</ol>`
        : `<p class="hint">${t("강의 영상을 준비하고 있습니다.", "cd.noLessons")}</p>`}
    </section>
  </article>`;

  const act = $("#act");
  if (state === "login") {
    act.innerHTML = `<p class="d-msg">${free ? t("회원이면 누구나 무료로 수강할 수 있습니다. 로그인해 주세요.", "cd.freeLogin")
      : t("로그인 후 수강 신청과 수강 코드 입력을 할 수 있습니다.", "cd.needLogin")}</p>
      <div class="btns"><button type="button" class="btn solid" id="loginBtn">${t("로그인 / 회원가입", "cd.login")}</button></div>`;
    $("#loginBtn").onclick = () => login();
    return;
  }
  if (state === "verify") { act.innerHTML = verifyGateHtml(me.user); bindVerifyGate(act, me.user); return; }
  // 시작 전 · 회수 = 안내 한 줄(+ 회수는 문의 버튼)
  if (state === "upcoming" || state === "revoked") {
    act.innerHTML = state === "upcoming"
      ? `<p class="d-msg">${tv("수강 시작일은 {d} 입니다.", "cd.upcoming", { d: fmtDate(enr?.startAt) })}</p>`
      : `<p class="d-msg">${t("수강권이 없습니다. 문의해 주세요.", "cd.revoked")}</p><div class="btns">${askBtns()}</div>`;
    return;
  }
  // 수강권 없음 · 기간 끝남 = ① 수강 신청(카카오톡) ② 수강 코드 등록 — 두 영역을 나눈다(2026-10-04 써니님 첨부 3)
  act.innerHTML = `${state === "expired" ? `<p class="d-msg d-expired">${tv("수강 기간이 끝났습니다. (종료일 {d})", "cd.expired", { d: fmtDate(enr?.endAt) })}</p>` : ""}
    <div class="d-apply">
      <p class="d-msg">${t("카카오톡으로 신청하시면 결제 방법을 안내해드립니다.", "cd.apply1")}<br>${t("입금 확인 후 수강 코드를 보내드립니다.", "cd.apply2")}</p>
      <div class="btns">${applyBtn()}</div>
    </div>
    <form class="code-form" id="codeForm" autocomplete="off">
      <p class="code-q">${t("이미 수강 코드를 받으셨나요?", "cd.codeQ")}</p>
      <label for="codeIn">${t("코드를 등록해 수강을 시작하세요.", "cd.codeSub")}</label>
      <div class="code-row"><input id="codeIn" name="code" maxlength="30" placeholder="${t("수강 코드 입력", "cd.codePh")}">
        <button type="submit" class="btn sage">${t("코드 등록", "cd.codeBtn")}</button></div>
      <p class="code-msg" id="codeMsg" role="status"></p></form>`;
  $("#codeForm").onsubmit = onRedeem;
}

async function onRedeem(e) {
  e.preventDefault();
  const f = e.currentTarget, out = $("#codeMsg"), btn = f.querySelector("button");
  const code = f.code.value.trim();
  if (!code) { out.textContent = t("코드를 입력해 주세요.", "cd.codeEmpty"); return; }
  btn.disabled = true; out.className = "code-msg"; out.textContent = t("확인 중…", "cd.codeWait");
  try {
    const r = await redeemCode(code);
    if (!r.ok) { out.className = "code-msg err"; out.textContent = redeemMsg(r.reason); btn.disabled = false; return; }
    toast(t("수강권이 등록되었습니다. 바로 시작해 보세요!", "cd.codeOk"), 4000);
    await enter();
  } catch (err) {
    console.error(err);
    out.className = "code-msg err"; out.textContent = redeemMsg("fail"); btn.disabled = false;
  }
}

// ---------- 강의실 화면 ----------
function renderRoom() {
  detailState = null;
  const now = Date.now();
  app.innerHTML = `
  ${preview ? `<div class="alert">관리자 미리보기입니다 — 수강권이 없어 진도는 저장되지 않습니다.</div>` : ""}
  <div class="watch">
    <section class="now">
      <div class="player-box" id="pbox"></div>
      <h2 id="lTitle"></h2>
      <div class="line"><span id="lMeta"></span><span id="lState"></span></div>
      <div class="bar" id="lBar"><i></i></div>
      <p class="notice">영상의 ${Math.round(policy.completeRatio * 100)}% 이상을 실제로 시청하면 차시가 완료됩니다.
        ${policy.maxRate}배속까지 수강으로 인정되며, 건너뛴 구간은 수강률에 포함되지 않습니다.</p>
    </section>
    <aside class="side card-box">
      <span class="eyebrow">Course</span>
      <h3 style="font-family:var(--serif);font-weight:500;font-size:1.25rem;line-height:1.35;margin:6px 0 14px">${esc(course.title)}</h3>
      <div class="sum"><span class="small muted">수강률</span><b id="cPct">0%</b></div>
      <div class="bar" id="cBar"><i></i></div>
      <div class="small muted" id="cMeta"></div>
      ${enr ? `<div class="small muted">수강 기간 ${fmtPeriod(enr)} · ${fmtLeft(enr.endAt, now)}</div>` : ""}
      <ol class="lessons" id="lList"></ol>
    </aside>
  </div>`;
  buildList();
  $("#lList").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-l]");
    if (b && b.dataset.l !== curId) openLesson(b.dataset.l);
  });
}

// 차시 목록 뼈대 — 강의실을 열 때 한 번만 그린다.
// (재생 중 1초마다 목록을 통째로 다시 그리면, 누르는 순간 버튼이 바뀌어 클릭이 사라질 수 있음)
function buildList() {
  $("#lList").innerHTML = lessons.map((l) => `<li data-li="${esc(l.id)}"><button type="button" data-l="${esc(l.id)}">
      <span class="no"></span>
      <span class="t">${esc(l.title)}<small>${fmtDur(l.durationSec)}</small></span>
      <span class="p"></span></button></li>`).join("");
}

// 수치만 바꾼다(1초마다 호출되므로 글자·표시만 갱신)
function refresh() {
  const cs = courseStat(progress, lessons, policy);
  $("#cPct").textContent = fmtPct(cs.ratio);
  $("#cBar").classList.toggle("done", cs.complete);
  $("#cBar i").style.width = (cs.ratio * 100).toFixed(1) + "%";
  $("#cMeta").textContent = `완료 ${cs.doneCount}/${cs.count}강 · 시청 ${fmtDur(cs.watched)} / 전체 ${fmtDur(cs.total)}`;
  lessons.forEach((l, i) => {
    const li = $(`#lList [data-li="${CSS.escape(l.id)}"]`);
    const st = lessonStat(progress?.lessons?.[l.id], l, policy);
    li.classList.toggle("on", l.id === curId);
    li.classList.toggle("done", st.done);
    li.querySelector(".no").textContent = st.done ? "✓" : String(i + 1);
    li.querySelector(".p").textContent = fmtPct(st.ratio);
  });
  const l = lessons.find((x) => x.id === curId);
  if (l) {
    const st = lessonStat(progress?.lessons?.[l.id], l, policy);
    $("#lState").innerHTML = st.done ? `<span class="badge done">완료</span>` : `시청 ${fmtPct(st.ratio)}`;
    $("#lBar").classList.toggle("done", st.done);
    $("#lBar i").style.width = (st.ratio * 100).toFixed(1) + "%";
  }
}

async function saveLesson(lid, { seg, lastPos, done }) {
  progress = progress || { lessons: {} };
  progress.lessons = progress.lessons || {};
  progress.lessons[lid] = { ...(progress.lessons[lid] || {}), seg, lastPos, done };
  if (preview) return;
  const cs = courseStat(progress, lessons, policy);
  const firstComplete = cs.complete && !progress.completedAt;
  await setDoc(doc(db, "progress", `${me.uid}_${cid}`), {
    uid: me.uid, courseId: cid,
    lessons: { [lid]: { seg, lastPos, done, updatedAt: serverTimestamp() } },
    updatedAt: serverTimestamp(),
    ...(firstComplete ? { completedAt: serverTimestamp() } : {}),
  }, { merge: true });
  if (firstComplete) { progress.completedAt = Date.now(); toast("모든 차시를 완료했습니다. 수고하셨습니다!", 5000); }
}

async function openLesson(lid) {
  if (tracker) { await tracker.destroy(); tracker = null; }
  curId = lid;
  const l = lessons.find((x) => x.id === lid);
  history.replaceState(null, "", `?c=${encodeURIComponent(cid)}&l=${encodeURIComponent(lid)}`);
  $("#pbox").innerHTML = `<div id="player"></div>`;
  // 제목은 관리자가 입력한 그대로, 차시 번호는 정보 줄에(제목에 번호를 넣어도 겹치지 않게)
  $("#lTitle").textContent = l.title;
  $("#lMeta").textContent = `${lessons.indexOf(l) + 1}강 · ${fmtDur(l.durationSec)}`;
  refresh();
  tracker = new LessonTracker({
    el: $("#player"), lesson: l, entry: progress?.lessons?.[lid] || null, policy,
    onTick: (st) => {
      progress = progress || { lessons: {} };
      progress.lessons = progress.lessons || {};
      progress.lessons[lid] = { ...(progress.lessons[lid] || {}), seg: tracker.seg, done: st.done };
      refresh();
    },
    onSave: (data) => saveLesson(lid, data),
    onRateLimited: () => toast(`${policy.maxRate}배속까지만 수강으로 인정되어 ${policy.maxRate}배속으로 맞췄습니다.`),
  });
  await tracker.start();
}

// ---------- 무료 강좌 수강권 자동 받기 (2026-10-04 써니님: 0원 강좌는 회원 누구나 · 수강 기간 없음) ----------
// 인증된 회원이 공개된 무료 강좌를 열면: 수강권 없음 → 새로 받음 / 기간제·만료·시작 전 → 기간 제한 없음으로 바꿈 / 회수 → 그대로(문의)
// 허용 조건은 보안 규칙(firestore.rules enrollments 의 무료 강좌 create·update)이 최종 판정. 받았으면 true.
let claimTried = false;   // 한 페이지에서 한 번만(저장이 막혀도 다시 시도하며 맴돌지 않게)
async function claimFree() {
  if (claimTried || !me || !course?.published || !isFreePrice(course.priceLabel)) return false;
  if (enr && (enr.status !== "active" || enr.endAt == null)) return false;   // 회수됨 · 이미 기간 제한 없음
  claimTried = true;
  const ref = doc(db, "enrollments", `${me.uid}_${cid}`);
  // 시작 = 오늘 0시(한국시간) — 수강 코드·관리자 부여와 같은 달력 기준(휴대폰 시계가 조금 늦어도 "시작 전"이 되지 않게)
  const today0 = Timestamp.fromMillis(startOfKstDay(kstDateStr(Date.now())));
  if (!enr) {
    await setDoc(ref, { uid: me.uid, courseId: cid, status: "active", startAt: today0, endAt: null,
      extendedCount: 0, source: "free", grantedAt: serverTimestamp() });
  } else {
    await updateDoc(ref, { endAt: null, freeAt: serverTimestamp(), ...(enr.startAt > Date.now() ? { startAt: today0 } : {}) });
  }
  return true;
}

async function enter() {
  if (tracker) { await tracker.destroy(); tracker = null; }
  if (!cid) return notice(t("강좌 주소가 올바르지 않습니다.", "cd.badUrl"), wsBtn());

  try { const s = await getDoc(doc(db, "courses", cid)); course = s.exists() ? s.data() : null; }
  catch { course = null; }
  if (!course) return notice(t("강좌를 찾을 수 없습니다.", "cd.notFound"), wsBtn());
  document.title = `${course.title} | ${t("벨라온 온라인 클래스", "cd.siteTitle")}`;

  // 목차(공개 칸)와 운영 기준은 누구나 읽을 수 있다
  const [ls, pol] = await Promise.all([
    getDocs(query(collection(db, "courses", cid, "lessons"), orderBy("order"))).catch(() => null),
    loadPolicy(),
  ]);
  lessons = ls ? ls.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
  policy = pol;

  if (!me) return renderDetail("login");
  if (needsVerify(me.user)) return renderDetail("verify");
  app.onclick = null;

  const es = await getDoc(doc(db, "enrollments", `${me.uid}_${cid}`)).catch(() => null);
  enr = es?.exists() ? toEnr(es.id, es.data()) : null;
  if (await claimFree()) return enter();   // 무료 강좌 → 수강권을 받았으면 처음부터 다시(이제 수강 중)
  const state = enrollState(enr, Date.now());
  preview = state !== "active" && me.isAdmin;
  if (state !== "active" && !preview) return renderDetail(state);
  if (preview) enr = null;

  if (!policy) return notice("운영 기준이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.", askBtns());
  if (!lessons.length) return notice("아직 등록된 영상이 없습니다. 곧 열립니다.", `<a class="btn" href="/mypage.html">My Class</a>`);

  // 영상 주소(수강생 전용 칸)를 차시 ID 로 짝지어 붙인다
  const vs = await getDocs(collection(db, "courses", cid, "videos"));
  const vid = {};
  vs.forEach((d) => { vid[d.id] = d.data().youtubeId; });
  lessons = lessons.map((l) => ({ ...l, youtubeId: vid[l.id] || "" })).filter((l) => l.youtubeId);
  if (!lessons.length) return notice("아직 등록된 영상이 없습니다. 곧 열립니다.", `<a class="btn" href="/mypage.html">My Class</a>`);

  progress = preview ? null : ((await getDoc(doc(db, "progress", `${me.uid}_${cid}`))).data() || null);

  renderRoom();
  const want = params.get("l");
  const first = lessons.find((l) => l.id === want)
    || lessons.find((l) => !lessonStat(progress?.lessons?.[l.id], l, policy).done)
    || lessons[0];
  await openLesson(first.id);
}

if (!CONFIGURED) {
  app.innerHTML = notConfiguredHtml();
} else {
  watchUser(async ({ user, isAdmin }) => {
    me = user ? { uid: user.uid, isAdmin, user } : null;
    try { await enter(); }
    catch (e) { console.error(e); notice(t("강의실을 열지 못했습니다. 잠시 후 다시 시도해 주세요.", "cd.openFail"), askBtns()); }
  });
  // 상세 화면은 언어를 바꾸면 그 자리에서 다시 그린다(강의실은 한국어 화면)
  onLangChange(() => { if (detailState && course) renderDetail(detailState); });
}
