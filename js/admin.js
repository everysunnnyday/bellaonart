// =========================================================
// 관리자 페이지 (/admin/) — 설계 §2 관리자 기능
//  ① 강좌·차시  ② 회원·수강권  ③ 수강 현황  ④ 수강 코드
// 관리자 판정·쓰기 권한은 firestore.rules 가 최종 결정한다(이 화면은 보여주기만).
// =========================================================
import {
  db, CONFIGURED, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, orderBy,
  writeBatch, serverTimestamp, Timestamp,
} from "./firebase.js";
import {
  initShell, watchUser, esc, $, toEnr, tsMs, loadPolicy, login, toast, dialog, notConfiguredHtml,
} from "./common.js";
import {
  DEFAULT_POLICY, enrollState, fmtLeft, courseStat, fmtDur, fmtPct, fmtDate,
  kstDateStr, startOfKstDay, endOfKstDay, defaultEndStr, courseDays, CODE_RE, normCode,
} from "./core.js";
import { parseYouTubeId, probeVideo } from "./youtube.js";

initShell({ active: "admin", kakao: false });
const root = $("#admin");
const S = {
  me: null, policy: null, courses: [], users: [], enrs: [],
  tab: "courses", selCourse: null, lessons: [], selUser: null, statusCourse: null,
};
const STATE_TXT = { active: "수강 중", upcoming: "시작 전", expired: "기간 종료", revoked: "회수됨", none: "-" };
const ID_RE = /^[a-z0-9-]{2,40}$/;   // firestore.rules 의 강좌 ID 조건과 같아야 함
const today = () => kstDateStr(Date.now());
const courseTitle = (cid) => S.courses.find((c) => c.id === cid)?.title || cid;
// 회원 정보가 없으면 = 마이페이지에서 탈퇴한 회원(수강 기록만 남음)
const userOf = (uid) => S.users.find((u) => u.id === uid) || { name: "(탈퇴 회원)", email: "" };

// ---------- 불러오기 ----------
async function loadAll() {
  S.policy = await loadPolicy();
  const [c, u, e] = await Promise.all([
    getDocs(collection(db, "courses")), getDocs(collection(db, "users")), getDocs(collection(db, "enrollments")),
  ]);
  S.courses = c.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title).localeCompare(b.title));
  S.users = u.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: tsMs(d.data().createdAt), lastLoginAt: tsMs(d.data().lastLoginAt) }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  S.enrs = e.docs.map((d) => toEnr(d.id, d.data()));
}
async function reloadEnrs() {
  const e = await getDocs(collection(db, "enrollments"));
  S.enrs = e.docs.map((d) => toEnr(d.id, d.data()));
}
// 차시 = 목차(lessons, 공개) + 영상 주소(videos, 수강생 전용) — 같은 차시 ID 로 짝지어 합친다
async function loadLessons(cid) {
  const [s, v] = await Promise.all([
    getDocs(query(collection(db, "courses", cid, "lessons"), orderBy("order"))),
    getDocs(collection(db, "courses", cid, "videos")),
  ]);
  const vid = {};
  v.forEach((d) => { vid[d.id] = d.data().youtubeId; });
  return s.docs.map((d) => ({ id: d.id, ...d.data(), youtubeId: vid[d.id] || "" }));
}

// ---------- 운영 기준 ----------
function renderPolicy() {
  const p = S.policy;
  $("#policy").innerHTML = p
    ? `<span>운영 기준</span>
       <span>차시 완료 <b>${Math.round(p.completeRatio * 100)}%</b></span>
       <span>인정 배속 <b>${p.maxRate}배</b></span>
       <span>기본 수강기간 <b>${p.defaultDays}일</b></span>
       <span>리마인드 메일 <b>남은 기간 ${p.remindDays}일</b>(오늘 포함)</span>
       <span>연장 <b>+${p.extendDays}일 · 1회 · 수강 중 언제든</b></span>
       <span class="hint">(변경은 Firebase 콘솔 config/policy)</span>`
    : "";
}

// ---------- 전체 틀 ----------
function renderShell() {
  renderPolicy();
  if (!S.policy) {
    root.innerHTML = `<div class="alert">운영 기준(config/policy)이 아직 없습니다. 설계 문서의 기본값으로 만들까요?<br>
      <span class="small muted">차시 완료 ${DEFAULT_POLICY.completeRatio * 100}% · ${DEFAULT_POLICY.maxRate}배속 · 기본 ${DEFAULT_POLICY.defaultDays}일 ·
      남은 기간 ${DEFAULT_POLICY.remindDays}일에 리마인드 메일 · 연장 +${DEFAULT_POLICY.extendDays}일(수강 중 언제든 1회, 최대 ${DEFAULT_POLICY.defaultDays + DEFAULT_POLICY.extendDays}일)</span><br><br>
      <button type="button" class="btn solid sm" id="mkPolicy">기본값으로 만들기</button></div>`;
    $("#mkPolicy").onclick = async () => {
      try { await setDoc(doc(db, "config/policy"), { ...DEFAULT_POLICY }); S.policy = await loadPolicy(); renderShell(); toast("운영 기준을 만들었습니다."); }
      catch (e) { console.error(e); toast("만들지 못했습니다: " + e.code); }
    };
    return;
  }
  root.innerHTML = `<div class="tabs" role="tablist">
      <button type="button" data-tab="courses">강좌·차시</button>
      <button type="button" data-tab="members">회원·수강권</button>
      <button type="button" data-tab="status">수강 현황</button>
      <button type="button" data-tab="codes">수강 코드</button>
    </div><div id="panel"></div>`;
  root.querySelector(".tabs").onclick = (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) { S.tab = b.dataset.tab; renderTab(); }
  };
  renderTab();
}
function renderTab() {
  root.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
  ({ courses: renderCourses, members: renderMembers, status: renderStatus, codes: renderCodes })[S.tab]();
}

// =========================================================
// ① 강좌·차시
// =========================================================
// 강좌 순서 바꾸기(H10) — 순서는 이 버튼으로만 정한다. 바꿀 때 전체를 1,2,3… 으로 다시 매겨 저장
async function moveCourse(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= S.courses.length) return;
  const next = S.courses.slice();
  [next[i], next[j]] = [next[j], next[i]];
  try {
    const batch = writeBatch(db);
    next.forEach((c, k) => { c.order = k + 1; batch.update(doc(db, "courses", c.id), { order: c.order }); });
    await batch.commit();
    S.courses = next;
    renderCourses();
  } catch (err) { console.error(err); toast("순서를 바꾸지 못했습니다: " + (err.code || err.message)); }
}

function renderCourses() {
  $("#panel").innerHTML = `<div class="split">
    <div>
      <div class="toolbar"><b>강좌 ${S.courses.length}개</b><button type="button" class="btn solid sm" id="newC">+ 새 강좌</button></div>
      <p class="hint" style="margin-bottom:10px">↑↓ 순서 = Workshop 페이지에 보이는 순서(공개 강좌만 표시)</p>
      <ul class="pick-list">${S.courses.map((c, i) => `<li><button type="button" data-c="${esc(c.id)}" class="${S.selCourse === c.id ? "on" : ""}">
        <span>${esc(c.title)}<br><span class="hint">${c.lessonCount || 0}강 · ${fmtDur(c.totalSec)}</span></span>
        <span class="badge ${c.published ? "active" : ""}">${c.published ? "공개" : "비공개"}</span></button>
        <span class="pick-ops"><button type="button" data-mv="-1" data-i="${i}" title="위로" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" data-mv="1" data-i="${i}" title="아래로" ${i === S.courses.length - 1 ? "disabled" : ""}>↓</button></span></li>`).join("")
      || `<li class="hint">아직 강좌가 없습니다.</li>`}</ul>
    </div>
    <div id="cEdit">${S.selCourse ? "" : `<div class="empty">왼쪽에서 강좌를 고르거나 새 강좌를 만드세요.</div>`}</div>
  </div>`;
  $("#newC").onclick = () => { S.selCourse = "new"; renderCourses(); };
  $("#panel .pick-list").onclick = async (e) => {
    const mv = e.target.closest("[data-mv]");
    if (mv) return moveCourse(+mv.dataset.i, +mv.dataset.mv);
    const b = e.target.closest("[data-c]");
    if (b) { S.selCourse = b.dataset.c; renderCourses(); }
  };
  if (S.selCourse) renderCourseEditor();
}

async function renderCourseEditor() {
  const isNew = S.selCourse === "new";
  const c = isNew ? { id: "", title: "", summary: "", description: "", priceLabel: "", defaultDays: S.policy.defaultDays, thumb: "", published: false }
    : S.courses.find((x) => x.id === S.selCourse);
  const box = $("#cEdit");
  box.innerHTML = `<div class="card-box">
    <form class="form" id="cForm" autocomplete="off">
      <label class="field">강좌 ID ${isNew ? "" : "(변경 불가)"}<input name="id" value="${esc(c.id)}" ${isNew ? "" : "disabled"} placeholder="예: paper-basic">
        <span class="hint">영문 소문자·숫자·하이픈(-)만, 주소에 쓰입니다. 순서는 왼쪽 목록의 ↑↓ 로 정합니다.</span></label>
      <label class="field">강좌 제목<input name="title" value="${esc(c.title)}" required></label>
      <label class="field">한 줄 소개<input name="summary" value="${esc(c.summary)}"></label>
      <label class="field">상세 소개 (수강 전 안내 화면에 표시)<textarea name="description">${esc(c.description)}</textarea></label>
      <div class="row">
        <label class="field">표시 가격<input name="priceLabel" value="${esc(c.priceLabel)}" placeholder="예: 150,000원"></label>
        <label class="field">기본 수강기간(일)<input name="defaultDays" type="number" min="1" value="${esc(c.defaultDays ?? S.policy.defaultDays)}"></label>
      </div>
      <label class="field">썸네일 이미지 주소<input name="thumb" value="${esc(c.thumb)}" placeholder="비우면 기본 이미지">
        <span class="hint">${isNew ? "저장 후 차시를 추가하면 첫 차시 썸네일을 쓸 수 있습니다." : `<button type="button" class="btn sm" id="ytThumb">첫 차시 유튜브 썸네일 쓰기</button>`}</span></label>
      <label class="check"><input type="checkbox" name="published" ${c.published ? "checked" : ""}> 공개 (Workshop 페이지에 보임)</label>
      <div><button type="submit" class="btn solid">${isNew ? "강좌 만들기" : "저장"}</button></div>
    </form>
  </div>
  ${isNew ? "" : `<div class="card-box" style="margin-top:20px" id="lBox"><div class="empty">차시 불러오는 중…</div></div>`}`;

  $("#cForm").onsubmit = (e) => { e.preventDefault(); saveCourse(isNew); };
  if (!isNew) {
    S.lessons = await loadLessons(c.id);
    renderLessons();
    $("#ytThumb").onclick = () => {
      if (!S.lessons[0]) return toast("먼저 차시를 추가하세요.");
      $("#cForm").thumb.value = `https://i.ytimg.com/vi/${S.lessons[0].youtubeId}/hqdefault.jpg`;
      toast("썸네일 주소를 넣었습니다. [저장]을 눌러야 반영됩니다.");
    };
  }
}

async function saveCourse(isNew) {
  const f = $("#cForm");
  const id = isNew ? f.id.value.trim() : S.selCourse;
  const data = {
    title: f.title.value.trim(), summary: f.summary.value.trim(), description: f.description.value.trim(),
    priceLabel: f.priceLabel.value.trim(), thumb: f.thumb.value.trim(),
    defaultDays: parseInt(f.defaultDays.value, 10),
    published: f.published.checked, updatedAt: serverTimestamp(),
  };
  if (!ID_RE.test(id)) return toast("강좌 ID는 영문 소문자·숫자·하이픈 2~40자로 정해 주세요.");
  if (!data.title) return toast("강좌 제목을 입력해 주세요.");
  if (!(data.defaultDays >= 1)) return toast("기본 수강기간은 1일 이상이어야 합니다.");
  try {
    const ref = doc(db, "courses", id);
    if (isNew) {
      if ((await getDoc(ref)).exists()) return toast("이미 있는 강좌 ID입니다.");
      // 새 강좌는 맨 뒤 순서
      const last = S.courses.reduce((m, x) => Math.max(m, x.order ?? 0), 0);
      Object.assign(data, { lessonCount: 0, totalSec: 0, order: last + 1, createdAt: serverTimestamp() });
    }
    await setDoc(ref, data, { merge: true });
    const snap = await getDoc(ref);
    const fresh = { id, ...snap.data() };
    S.courses = [...S.courses.filter((x) => x.id !== id), fresh]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title).localeCompare(b.title));
    S.selCourse = id;
    toast(isNew ? "강좌를 만들었습니다. 이제 차시를 추가하세요." : "저장했습니다.");
    renderCourses();
  } catch (e) { console.error(e); toast("저장하지 못했습니다: " + (e.code || e.message)); }
}

// 차시 변경과 강좌 요약(차시 수·총 길이)을 한 번에 저장 — 요약은 공개 목록 표시용 파생값
async function commitLessons(cid, nextLessons, ops) {
  const batch = writeBatch(db);
  ops(batch);
  const totalSec = nextLessons.reduce((s, l) => s + (l.durationSec || 0), 0);
  batch.update(doc(db, "courses", cid), { lessonCount: nextLessons.length, totalSec, updatedAt: serverTimestamp() });
  await batch.commit();
  S.lessons = nextLessons;
  const c = S.courses.find((x) => x.id === cid);
  Object.assign(c, { lessonCount: nextLessons.length, totalSec });
}

function renderLessons() {
  const cid = S.selCourse;
  const total = S.lessons.reduce((s, l) => s + (l.durationSec || 0), 0);
  $("#lBox").innerHTML = `
    <div class="toolbar"><b>차시 ${S.lessons.length}강 · 총 ${fmtDur(total)}</b></div>
    <ul class="lesson-rows">${S.lessons.map((l, i) => `<li data-id="${esc(l.id)}">
      <span class="no">${i + 1}</span>
      <div class="lt"><b style="font-weight:500">${esc(l.title)}</b><div class="hint">${fmtDur(l.durationSec)} · ${esc(l.youtubeId)}</div></div>
      <div class="ops">
        <button type="button" data-op="up" title="위로" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-op="down" title="아래로" ${i === S.lessons.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" data-op="edit" title="제목 수정">✎</button>
        <button type="button" data-op="del" title="삭제">✕</button>
      </div></li>`).join("") || `<li class="hint" style="display:block">아직 차시가 없습니다.</li>`}</ul>
    <div class="form" style="margin-top:18px">
      <label class="field">차시 추가 — 유튜브 주소 (일부공개 · 퍼가기 허용)
        <input id="yUrl" placeholder="https://youtu.be/..."></label>
      <div><button type="button" class="btn sm" id="yLoad">영상 정보 불러오기</button></div>
      <div id="yInfo"></div>
    </div>`;

  $("#lBox .lesson-rows").onclick = async (e) => {
    const b = e.target.closest("[data-op]");
    if (!b) return;
    const li = b.closest("li");
    const i = S.lessons.findIndex((l) => l.id === li.dataset.id);
    const l = S.lessons[i];
    const op = b.dataset.op;
    try {
      if (op === "up" || op === "down") {
        const j = op === "up" ? i - 1 : i + 1;
        const a = S.lessons[i], c2 = S.lessons[j];
        const next = S.lessons.slice();
        [next[i], next[j]] = [next[j], next[i]];
        next.forEach((x, k) => { x.order = k + 1; });
        await commitLessons(cid, next, (bt) => next.forEach((x) =>
          bt.update(doc(db, "courses", cid, "lessons", x.id), { order: x.order })));
        void a; void c2;
        renderLessons();
      } else if (op === "edit") {
        li.querySelector(".lt").innerHTML = `<input class="ed" value="${esc(l.title)}" style="width:100%;font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:6px">
          <div style="margin-top:6px;display:flex;gap:6px"><button type="button" class="btn sm solid" data-op="saveT">저장</button><button type="button" class="btn sm" data-op="cancelT">취소</button></div>`;
        li.querySelector(".ed").focus();
      } else if (op === "saveT") {
        const t = li.querySelector(".ed").value.trim();
        if (!t) return toast("제목을 입력해 주세요.");
        await updateDoc(doc(db, "courses", cid, "lessons", l.id), { title: t });
        l.title = t; renderLessons(); toast("제목을 바꿨습니다.");
      } else if (op === "cancelT") {
        renderLessons();
      } else if (op === "del") {
        const ok = await dialog({ title: "차시 삭제", body: `「${esc(l.title)}」 차시를 삭제할까요?<br><span class="small muted">수강생 수강률 계산에서도 이 차시가 빠집니다.</span>`, ok: "삭제" });
        if (!ok) return;
        const next = S.lessons.filter((x) => x.id !== l.id);
        next.forEach((x, k) => { x.order = k + 1; });
        await commitLessons(cid, next, (bt) => {
          bt.delete(doc(db, "courses", cid, "lessons", l.id));
          bt.delete(doc(db, "courses", cid, "videos", l.id));
          next.forEach((x) => bt.update(doc(db, "courses", cid, "lessons", x.id), { order: x.order }));
        });
        renderLessons(); toast("삭제했습니다.");
      }
    } catch (err) { console.error(err); toast("처리하지 못했습니다: " + (err.code || err.message)); }
  };

  $("#yLoad").onclick = async () => {
    const vid = parseYouTubeId($("#yUrl").value);
    if (!vid) return toast("유튜브 주소를 확인해 주세요.");
    const info = $("#yInfo");
    info.innerHTML = `<span class="hint">영상 정보를 읽는 중…</span>`;
    try {
      const v = await probeVideo(vid);
      info.innerHTML = `<div class="card-box" style="padding:14px;display:grid;gap:10px">
        <label class="field">차시 제목<input id="yTitle" value="${esc(v.title)}"></label>
        <span class="hint">영상 ID ${esc(vid)} · 길이 ${fmtDur(v.durationSec)} (자동)</span>
        <div><button type="button" class="btn solid sm" id="yAdd">차시 추가</button></div></div>`;
      $("#yAdd").onclick = async () => {
        const title = $("#yTitle").value.trim();
        if (!title) return toast("차시 제목을 입력해 주세요.");
        const ref = doc(collection(db, "courses", cid, "lessons"));
        const nl = { id: ref.id, title, youtubeId: vid, durationSec: v.durationSec, order: S.lessons.length + 1 };
        try {
          // 목차(공개)와 영상 주소(수강생 전용)를 한 번에 — 둘 중 하나만 저장되는 일이 없게
          await commitLessons(cid, [...S.lessons, nl], (bt) => {
            bt.set(ref, { title, durationSec: v.durationSec, order: nl.order, createdAt: serverTimestamp() });
            bt.set(doc(db, "courses", cid, "videos", ref.id), { youtubeId: vid });
          });
          renderLessons(); toast("차시를 추가했습니다.");
        } catch (err) { console.error(err); toast("추가하지 못했습니다: " + (err.code || err.message)); }
      };
    } catch (err) {
      info.innerHTML = `<span class="hint" style="color:var(--pink-deep)">${esc(err.message)}</span>`;
    }
  };
}

// =========================================================
// ② 회원·수강권
// =========================================================
let memberQuery = "";
function renderMembers() {
  const q = memberQuery.toLowerCase();
  const list = S.users.filter((u) => !q || (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
  const now = Date.now();
  $("#panel").innerHTML = `
    <div id="mDetail"></div>
    <div class="toolbar">
      <label class="field" style="flex:1;max-width:340px"><input id="mSearch" placeholder="이름·이메일 검색" value="${esc(memberQuery)}"></label>
      <span class="hint">회원 ${list.length}명 · 수강생은 먼저 한 번 로그인해야 목록에 나타납니다.</span>
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>이름</th><th>이메일</th><th>연락처</th><th>가입 방식</th><th>가입일</th><th>최근 접속</th><th>수강권</th></tr></thead>
    <tbody>${list.map((u) => {
      const mine = S.enrs.filter((e) => e.uid === u.id);
      return `<tr class="click" data-u="${esc(u.id)}"><td>${esc(u.name || "-")}</td><td>${esc(u.email)}</td>
        <td>${esc(u.phone || "-")}</td><td>${u.provider === "password" ? "이메일" : "구글"}</td><td>${fmtDate(u.createdAt)}</td><td>${fmtDate(u.lastLoginAt)}</td>
        <td>${mine.map((e) => { const st = enrollState(e, now); return `<span class="badge ${st === "active" ? "active" : ""}">${esc(courseTitle(e.courseId))} · ${STATE_TXT[st]}</span>`; }).join(" ") || "-"}</td></tr>`;
    }).join("") || `<tr><td colspan="7" class="hint">회원이 없습니다.</td></tr>`}</tbody></table></div>`;
  const s = $("#mSearch");
  s.oninput = () => { memberQuery = s.value; const pos = s.selectionStart; renderMembers(); const n = $("#mSearch"); n.focus(); n.setSelectionRange(pos, pos); };
  $("#panel tbody").onclick = (e) => {
    const tr = e.target.closest("[data-u]");
    if (tr) { S.selUser = tr.dataset.u; renderMemberDetail(); $("#mDetail").scrollIntoView({ behavior: "smooth", block: "start" }); }
  };
  if (S.selUser) renderMemberDetail();
}

function renderMemberDetail() {
  const u = userOf(S.selUser);
  const now = Date.now();
  const mine = S.enrs.filter((e) => e.uid === S.selUser);
  const firstC = S.courses[0];
  $("#mDetail").innerHTML = `<div class="card-box" style="margin-bottom:22px">
    <div class="toolbar"><div><b>${esc(u.name || "-")}</b> <span class="muted small">${esc(u.email)}</span></div>
      <button type="button" class="btn sm" data-act="close">닫기</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>강좌</th><th>기간</th><th>상태</th><th>연장</th><th>부여</th><th>메모</th><th>관리</th></tr></thead>
    <tbody>${mine.map((e) => {
      const st = enrollState(e, now);
      return `<tr data-e="${esc(e.id)}"><td>${esc(courseTitle(e.courseId))}</td>
        <td class="per">${fmtDate(e.startAt)} ~ ${fmtDate(e.endAt)}${st === "active" ? ` <span class="hint">(${fmtLeft(e.endAt, now)})</span>` : ""}</td>
        <td><span class="badge ${st === "active" ? "active" : ""}">${STATE_TXT[st]}</span></td>
        <td>${e.extendedCount ? `사용 (${fmtDate(e.extendedAt)})` : "-"}</td>
        <td class="hint">${e.source === "code" ? `코드 ${esc(e.code || "")}` : `${e.source === "payment" ? "결제" : "관리자"} ${esc(e.grantedBy || "")}`}</td>
        <td class="hint">${esc(e.memo || "")}</td>
        <td><button type="button" class="btn sm" data-act="edit">기간 수정</button>
          ${e.status === "active" ? `<button type="button" class="btn sm" data-act="revoke">회수</button>` : `<button type="button" class="btn sm" data-act="restore">복구</button>`}</td></tr>`;
    }).join("") || `<tr><td colspan="7" class="hint">수강권이 없습니다.</td></tr>`}</tbody></table></div>

    <h4 style="margin:22px 0 10px;font-weight:500">수강권 부여</h4>
    ${firstC ? `<div class="form"><div class="row">
      <label class="field">강좌<select id="gC">${S.courses.map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join("")}</select></label>
      <label class="field">시작일<input type="date" id="gS" value="${today()}"></label>
      <label class="field">종료일<input type="date" id="gE"></label>
      <label class="field">메모<input id="gM" placeholder="예: 10/2 계좌이체 확인"></label>
    </div><div><button type="button" class="btn solid sm" data-act="grant">수강권 부여</button>
      <span class="hint" id="gHint"></span></div></div>` : `<p class="hint">먼저 강좌를 만드세요.</p>`}
  </div>`;

  const setEnd = () => {
    const c = S.courses.find((x) => x.id === $("#gC").value);
    const days = courseDays(c, S.policy);
    $("#gE").value = defaultEndStr($("#gS").value || today(), days);
    $("#gHint").textContent = ` 기본 ${days}일 (시작일 포함)`;
  };
  if (firstC) { setEnd(); $("#gC").onchange = setEnd; $("#gS").onchange = setEnd; }

  $("#mDetail").onclick = async (ev) => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const tr = b.closest("[data-e]");
    const e = tr && S.enrs.find((x) => x.id === tr.dataset.e);
    try {
      if (act === "close") { S.selUser = null; $("#mDetail").innerHTML = ""; return; }
      if (act === "grant") return await grant();
      if (act === "edit") {
        tr.querySelector(".per").innerHTML = `<input type="date" class="es" value="${kstDateStr(e.startAt)}"> ~ <input type="date" class="ee" value="${kstDateStr(e.endAt)}">
          <button type="button" class="btn sm solid" data-act="saveP">저장</button> <button type="button" class="btn sm" data-act="cancelP">취소</button>`;
        return;
      }
      if (act === "cancelP") return renderMemberDetail();
      if (act === "saveP") {
        const s = tr.querySelector(".es").value, en = tr.querySelector(".ee").value;
        if (!s || !en || en < s) return toast("기간을 확인해 주세요(종료일이 시작일보다 빠를 수 없음).");
        await updateDoc(doc(db, "enrollments", e.id), {
          startAt: Timestamp.fromMillis(startOfKstDay(s)), endAt: Timestamp.fromMillis(endOfKstDay(en)),
        });
        toast("기간을 바꿨습니다.");
      }
      if (act === "revoke") {
        const ok = await dialog({ title: "수강권 회수", body: `「${esc(courseTitle(e.courseId))}」 수강권을 회수할까요?<br><span class="small muted">즉시 강의실에 들어갈 수 없게 됩니다. 진도 기록은 남습니다.</span>`, ok: "회수" });
        if (!ok) return;
        await updateDoc(doc(db, "enrollments", e.id), { status: "revoked", revokedAt: serverTimestamp() });
        toast("회수했습니다.");
      }
      if (act === "restore") {
        await updateDoc(doc(db, "enrollments", e.id), { status: "active" });
        toast("복구했습니다. 기간이 지났다면 [기간 수정]도 함께 해 주세요.");
      }
      await reloadEnrs();
      renderMembers();
    } catch (err) { console.error(err); toast("처리하지 못했습니다: " + (err.code || err.message)); }
  };
}

async function grant() {
  const uid = S.selUser, cid = $("#gC").value, s = $("#gS").value, en = $("#gE").value, memo = $("#gM").value.trim();
  if (!s || !en || en < s) return toast("기간을 확인해 주세요(종료일이 시작일보다 빠를 수 없음).");
  const old = S.enrs.find((e) => e.uid === uid && e.courseId === cid);
  const st = enrollState(old, Date.now());
  if (st === "active" || st === "upcoming") {
    const ok = await dialog({ title: "이미 수강권이 있습니다",
      body: `현재 ${fmtDate(old.startAt)} ~ ${fmtDate(old.endAt)} (${STATE_TXT[st]})<br>새로 부여하면 기간이 바뀌고 <b>연장 기회도 다시 생깁니다.</b><br>
        <span class="small muted">기간만 바꾸려면 [기간 수정]을 쓰세요.</span>`, ok: "새로 부여" });
    if (!ok) return;
  }
  await setDoc(doc(db, "enrollments", `${uid}_${cid}`), {
    uid, courseId: cid, status: "active",
    startAt: Timestamp.fromMillis(startOfKstDay(s)), endAt: Timestamp.fromMillis(endOfKstDay(en)),
    extendedCount: 0, source: "admin", grantedBy: S.me.email, grantedAt: serverTimestamp(), memo,
  });
  toast("수강권을 부여했습니다.");
  await reloadEnrs();
  renderMembers();
}

// =========================================================
// ③ 수강 현황
// =========================================================
async function renderStatus() {
  if (!S.courses.length) { $("#panel").innerHTML = `<div class="empty">강좌가 없습니다.</div>`; return; }
  if (!S.statusCourse || !S.courses.some((c) => c.id === S.statusCourse)) S.statusCourse = S.courses[0].id;
  const cid = S.statusCourse;
  $("#panel").innerHTML = `<div class="toolbar">
      <label class="field" style="min-width:240px"><select id="sC">${S.courses.map((c) => `<option value="${esc(c.id)}" ${c.id === cid ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select></label>
      <span class="hint" id="sSum"></span></div>
    <div class="tbl-wrap"><div class="empty">불러오는 중…</div></div>`;
  $("#sC").onchange = () => { S.statusCourse = $("#sC").value; renderStatus(); };

  const [lessons, ps] = await Promise.all([
    loadLessons(cid), getDocs(query(collection(db, "progress"), where("courseId", "==", cid))),
  ]);
  if (S.statusCourse !== cid) return;   // 그사이 다른 강좌를 골랐으면 버림
  const prog = {};
  ps.forEach((d) => { prog[d.data().uid] = d.data(); });
  const now = Date.now();
  const rows = S.enrs.filter((e) => e.courseId === cid).map((e) => {
    const st = enrollState(e, now);
    const p = prog[e.uid] || null;
    return { e, st, u: userOf(e.uid), p, cs: courseStat(p, lessons, S.policy), last: tsMs(p?.updatedAt), done: tsMs(p?.completedAt) };
  });
  const rank = { active: 0, upcoming: 1, expired: 2, revoked: 3 };
  rows.sort((a, b) => rank[a.st] - rank[b.st] || b.cs.ratio - a.cs.ratio);
  const act = rows.filter((r) => r.st === "active");
  const avg = act.length ? act.reduce((s, r) => s + r.cs.ratio, 0) / act.length : 0;
  $("#sSum").textContent = `수강생 ${rows.length}명 · 수강 중 ${act.length}명 · 완료 ${rows.filter((r) => r.cs.complete || r.done).length}명 · 수강 중 평균 수강률 ${fmtPct(avg)} · ${lessons.length}강 ${fmtDur(lessons.reduce((s, l) => s + (l.durationSec || 0), 0))}`;
  $("#panel .tbl-wrap").innerHTML = `<table class="tbl"><thead><tr>
      <th>이름</th><th>이메일</th><th>상태</th><th>기간</th><th>남은 일</th><th>연장</th><th>수강률</th><th>완료 차시</th><th>마지막 시청</th><th>수강 완료</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${esc(r.u.name || "-")}</td><td>${esc(r.u.email)}</td>
      <td><span class="badge ${r.st === "active" ? "active" : ""}">${STATE_TXT[r.st]}</span></td>
      <td>${fmtDate(r.e.startAt)} ~ ${fmtDate(r.e.endAt)}</td>
      <td>${r.st === "active" ? fmtLeft(r.e.endAt, now) : "-"}</td>
      <td>${r.e.extendedCount ? "사용" : "-"}</td>
      <td><span class="bar ${r.cs.complete ? "done" : ""}"><i style="width:${(r.cs.ratio * 100).toFixed(1)}%"></i></span>${fmtPct(r.cs.ratio)}</td>
      <td>${r.cs.doneCount}/${r.cs.count}</td>
      <td>${fmtDate(r.last)}</td>
      <td>${r.done ? fmtDate(r.done) : "-"}</td></tr>`).join("") || `<tr><td colspan="10" class="hint">이 강좌의 수강생이 없습니다.</td></tr>`}</tbody></table>`;
}

// =========================================================
// ④ 수강 코드 (설계 §12) — 회원이 상세 페이지에서 코드를 넣으면 서버 함수가 확인 후 바로 수강권 생성
// =========================================================
const codeState = (c, now) => !c.active ? "중지"
  : c.expiresAt && now > c.expiresAt ? "마감일 지남"
  : c.maxUses != null && c.usedCount >= c.maxUses ? "인원 마감" : "사용 가능";

async function renderCodes() {
  if (!S.courses.length) { $("#panel").innerHTML = `<div class="empty">먼저 강좌를 만드세요.</div>`; return; }
  $("#panel").innerHTML = `<div class="card-box" style="margin-bottom:22px">
      <h4 style="font-weight:500;margin-bottom:6px">새 수강 코드</h4>
      <p class="hint" style="margin-bottom:14px">회원이 강좌 상세 페이지에서 이 코드를 넣으면 <b>관리자 승인 없이 바로</b> 수강권이 생깁니다
        (오늘부터 강좌 기본 수강일 · 연장 1회 동일). 한 사람은 한 코드를 1번만 쓸 수 있고, 이메일 인증을 마친 회원만 쓸 수 있습니다.</p>
      <form class="form" id="kForm" autocomplete="off"><div class="row">
        <label class="field">코드<input name="code" placeholder="예: comos2026" maxlength="30">
          <span class="hint">영문·숫자·하이픈(-) 4~30자 · 대소문자 구분 없음</span></label>
        <label class="field">강좌<select name="course">${S.courses.map((c) => `<option value="${esc(c.id)}">${esc(c.title)}${c.published ? "" : " (비공개)"}</option>`).join("")}</select></label>
        <label class="field">인원 제한<input name="max" type="number" min="1" placeholder="비우면 무제한"></label>
        <label class="field">사용 마감일<input name="until" type="date"><span class="hint">비우면 마감 없음 · 그날 23:59까지</span></label>
        <label class="field">메모<input name="memo" placeholder="예: 코스모스 10월 단체 수강"></label>
      </div><div><button type="submit" class="btn solid sm">코드 만들기</button></div></form>
    </div>
    <div class="tbl-wrap"><div class="empty">불러오는 중…</div></div>`;
  $("#kForm").onsubmit = (e) => { e.preventDefault(); createCode(); };

  const snap = await getDocs(collection(db, "codes"));
  if (S.tab !== "codes") return;
  const now = Date.now();
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), expiresAt: tsMs(d.data().expiresAt), createdAt: tsMs(d.data().createdAt) }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  $("#panel .tbl-wrap").innerHTML = `<table class="tbl"><thead><tr>
      <th>코드</th><th>강좌</th><th>사용</th><th>마감일</th><th>상태</th><th>메모</th><th>만든 날</th><th>관리</th></tr></thead>
    <tbody>${list.map((c) => {
      const st = codeState(c, now);
      return `<tr data-k="${esc(c.id)}"><td><b style="font-weight:500">${esc(c.id)}</b></td><td>${esc(courseTitle(c.courseId))}</td>
        <td>${c.usedCount || 0}${c.maxUses != null ? ` / ${c.maxUses}명` : "명 (무제한)"}</td>
        <td>${c.expiresAt ? fmtDate(c.expiresAt) : "-"}</td>
        <td><span class="badge ${st === "사용 가능" ? "active" : ""}">${st}</span></td>
        <td class="hint">${esc(c.memo || "")}</td><td class="hint">${fmtDate(c.createdAt)}</td>
        <td><button type="button" class="btn sm" data-act="uses">사용자</button>
          <button type="button" class="btn sm" data-act="${c.active ? "stop" : "resume"}">${c.active ? "중지" : "다시 사용"}</button></td></tr>
        <tr class="uses-row" data-uses="${esc(c.id)}" hidden><td colspan="8"></td></tr>`;
    }).join("") || `<tr><td colspan="8" class="hint">아직 만든 코드가 없습니다.</td></tr>`}</tbody></table>`;

  $("#panel .tbl-wrap").onclick = async (ev) => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const id = b.closest("[data-k]").dataset.k;
    try {
      if (b.dataset.act === "stop" || b.dataset.act === "resume") {
        await updateDoc(doc(db, "codes", id), { active: b.dataset.act === "resume" });
        toast(b.dataset.act === "stop" ? "코드를 중지했습니다. 이미 받은 수강권은 그대로입니다." : "코드를 다시 쓸 수 있게 했습니다.");
        return renderCodes();
      }
      const row = $(`#panel [data-uses="${CSS.escape(id)}"]`);
      if (!row.hidden) { row.hidden = true; return; }
      const us = await getDocs(collection(db, "codes", id, "uses"));
      const rows = us.docs.map((d) => ({ ...d.data(), at: tsMs(d.data().at) })).sort((a, b) => (a.at || 0) - (b.at || 0));
      row.querySelector("td").innerHTML = rows.length
        ? rows.map((u) => `${esc(userOf(u.uid).name || "-")} <span class="hint">${esc(u.email || userOf(u.uid).email)} · ${fmtDate(u.at)}</span>`).join("<br>")
        : `<span class="hint">아직 사용한 회원이 없습니다.</span>`;
      row.hidden = false;
    } catch (err) { console.error(err); toast("처리하지 못했습니다: " + (err.code || err.message)); }
  };
}

async function createCode() {
  const f = $("#kForm");
  const id = normCode(f.code.value);
  const max = f.max.value.trim();
  if (!CODE_RE.test(id)) return toast("코드는 영문·숫자·하이픈(-) 4~30자로 정해 주세요.");
  if (max && !(parseInt(max, 10) >= 1)) return toast("인원 제한은 1명 이상이어야 합니다(무제한이면 비워 두세요).");
  if (f.until.value && f.until.value < today()) return toast("사용 마감일이 오늘보다 앞입니다.");
  try {
    if ((await getDoc(doc(db, "codes", id))).exists()) return toast("이미 있는 코드입니다. 다른 글자로 정해 주세요.");
    await setDoc(doc(db, "codes", id), {
      courseId: f.course.value, maxUses: max ? parseInt(max, 10) : null,
      expiresAt: f.until.value ? Timestamp.fromMillis(endOfKstDay(f.until.value)) : null,
      active: true, memo: f.memo.value.trim(), usedCount: 0, createdBy: S.me.email, createdAt: serverTimestamp(),
    });
    toast(`코드 ${id} 를 만들었습니다.`);
    renderCodes();
  } catch (e) { console.error(e); toast("만들지 못했습니다: " + (e.code || e.message)); }
}

// ---------- 시작 ----------
if (!CONFIGURED) {
  root.innerHTML = notConfiguredHtml();
} else {
  watchUser(async ({ user, isAdmin }) => {
    S.me = user;
    $("#policy").innerHTML = "";
    if (!user) {
      root.innerHTML = `<div class="empty">관리자 계정으로 로그인해 주세요.<br><br><button type="button" class="btn solid" id="loginBtn">로그인</button></div>`;
      $("#loginBtn").onclick = login;
      return;
    }
    if (!isAdmin) { root.innerHTML = `<div class="empty">관리자만 들어올 수 있는 페이지입니다.<br><a href="/workshop.html">Workshop 으로 가기</a></div>`; return; }
    root.innerHTML = `<div class="empty">불러오는 중…</div>`;
    try { await loadAll(); renderShell(); }
    catch (e) { console.error(e); root.innerHTML = `<div class="empty">불러오지 못했습니다: ${esc(e.code || e.message)}</div>`; }
  });
}
