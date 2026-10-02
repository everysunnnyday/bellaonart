// 강의실 (/class/watch.html?c=코스ID[&l=차시ID]) — 영상 시청 · 실제 시청 구간 기록 · 수강률
import {
  db, CONFIGURED, doc, getDoc, getDocs, setDoc, collection, query, orderBy, serverTimestamp,
} from "./firebase.js";
import {
  initShell, watchUser, esc, $, toEnr, loadPolicy, login, toast,
  notConfiguredHtml, KAKAO_CHANNEL, PHONE, DEFAULT_THUMB, needsVerify, verifyGateHtml, bindVerifyGate,
} from "./common.js";
import { enrollState, fmtLeft, lessonStat, courseStat, fmtDur, fmtPct, fmtDate } from "./core.js";
import { LessonTracker } from "./youtube.js";

initShell({ active: "workshop" });
const app = $("#app");
const params = new URLSearchParams(location.search);
const cid = params.get("c");

let me = null, course = null, enr = null, policy = null, lessons = [], progress = null;
let tracker = null, curId = null, preview = false;

// ---------- 수강권이 없을 때 등 안내 화면 ----------
function gate(msg, btns = "") {
  app.innerHTML = `<div class="gate">
    ${course ? `<div class="thumb" style="background-image:url('${esc(course.thumb || DEFAULT_THUMB)}')"></div>
      <span class="eyebrow">Online Class</span><h1>${esc(course.title)}</h1>
      ${course.description || course.summary ? `<p class="desc">${esc(course.description || course.summary)}</p>` : ""}` : ""}
    <p class="state">${msg}</p>
    <div class="btns">${btns}</div></div>`;
}
const askBtns = `<a class="btn solid" href="${KAKAO_CHANNEL}" target="_blank" rel="noopener">카카오톡으로 수강 문의</a>
  <a class="btn" href="tel:${PHONE.replace(/-/g, "")}">전화 ${PHONE}</a>`;

// ---------- 강의실 화면 ----------
function renderRoom() {
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
      ${enr ? `<div class="small muted">수강 기간 ${fmtDate(enr.startAt)} ~ ${fmtDate(enr.endAt)} · ${fmtLeft(enr.endAt, now)}</div>` : ""}
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

async function enter() {
  if (tracker) { await tracker.destroy(); tracker = null; }
  if (!cid) return gate("강좌 주소가 올바르지 않습니다.", `<a class="btn" href="/workshop.html">Workshop</a>`);

  try { const s = await getDoc(doc(db, "courses", cid)); course = s.exists() ? s.data() : null; }
  catch { course = null; }
  if (!course) return gate("강좌를 찾을 수 없습니다.", `<a class="btn" href="/workshop.html">Workshop</a>`);
  document.title = `${course.title} | 벨라온 온라인 클래스`;

  if (!me) {
    gate("로그인 후 수강할 수 있습니다.", `<button type="button" class="btn solid" id="loginBtn">로그인 / 회원가입</button>`);
    $("#loginBtn").onclick = login;
    return;
  }
  if (needsVerify(me.user)) { app.innerHTML = verifyGateHtml(me.user); bindVerifyGate(app, me.user); return; }
  app.onclick = null;

  const es = await getDoc(doc(db, "enrollments", `${me.uid}_${cid}`)).catch(() => null);
  enr = es?.exists() ? toEnr(es.id, es.data()) : null;
  const state = enrollState(enr, Date.now());
  preview = state !== "active" && me.isAdmin;
  if (state !== "active" && !preview) {
    const msg = {
      none: "수강 신청 후 시청할 수 있습니다.",
      upcoming: `수강 시작일은 ${fmtDate(enr?.startAt)} 입니다.`,
      expired: `수강 기간이 끝났습니다. (종료일 ${fmtDate(enr?.endAt)})`,
      revoked: "수강권이 없습니다. 문의해 주세요.",
    }[state];
    return gate(msg, askBtns);
  }
  if (preview) enr = null;

  policy = await loadPolicy();
  if (!policy) return gate("운영 기준이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.", askBtns);

  const ls = await getDocs(query(collection(db, "courses", cid, "lessons"), orderBy("order")));
  lessons = ls.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!lessons.length) return gate("아직 등록된 영상이 없습니다. 곧 열립니다.", `<a class="btn" href="/mypage.html">My Class</a>`);

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
    catch (e) { console.error(e); gate("강의실을 열지 못했습니다. 잠시 후 다시 시도해 주세요.", askBtns); }
  });
}
