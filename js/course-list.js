// 강좌 카드 목록 — Workshop 페이지와 마이페이지(수강 중인 강좌가 없을 때)가 함께 쓰는 한 곳
// 공개 강좌를 관리자가 정한 순서대로 매번 새로 읽는다 → 관리자가 강좌를 추가·공개하면 바로 반영
// 로그인한 회원에게는 카드마다 내 수강 상태(수강 중 · 기간 종료) 표시
import { db, collection, query, where, getDocs } from "./firebase.js";
import { watchUser, esc, toEnr, DEFAULT_THUMB, initReveal } from "./common.js";
import { enrollState, fmtLeft } from "./core.js";
import { t, tv, onLangChange } from "./i18n.js";

let box = null;          // 지금 목록을 그릴 자리(마이페이지는 다시 그릴 때마다 새 자리)
let courses = null;
let myEnr = {};          // courseId → 수강권
let started = false;

// 남은 일수 계산은 core.js 한 곳 — 여기서는 문구만 언어에 맞게 넘긴다
const leftText = (endAt, now) => fmtLeft(endAt, now, { today: t("오늘 종료", "left.today"), days: t("{d}일 남음", "left.days") });

function render() {
  if (!box || !box.isConnected) return;
  if (!courses) { box.innerHTML = `<div class="empty">${t("강좌를 불러오는 중…", "ws.loading")}</div>`; return; }
  if (!courses.length) { box.innerHTML = `<div class="empty">${t("곧 새로운 클래스가 열립니다.", "ws.empty")}</div>`; return; }
  const now = Date.now();
  box.innerHTML = `<div class="edu">${courses.map((c) => {
    const e = myEnr[c.id];
    const st = enrollState(e, now);
    const badge = st === "active" ? `<span class="badge">${tv("수강 중 · {left}", "ws.enrolled", { left: leftText(e.endAt, now) })}</span>`
      : st === "expired" ? `<span class="badge off">${t("기간 종료", "ws.expired")}</span>` : "";
    const meta = c.lessonCount
      ? tv("{n}강 · 총 {min}분", "ws.meta", { n: c.lessonCount, min: Math.round((c.totalSec || 0) / 60) })
      : t("준비 중", "ws.soon");
    return `<a class="card reveal" href="/class/watch.html?c=${encodeURIComponent(c.id)}">
      <div class="ph"><img src="${esc(c.thumb || DEFAULT_THUMB)}" alt="${esc(c.title)}"></div>
      <h4>${esc(c.title)}</h4>
      <p class="meta">${esc(meta)}${c.priceLabel ? ` · ${esc(c.priceLabel)}` : ""}</p>
      ${badge}
    </a>`;
  }).join("")}</div>`;
  box.querySelectorAll(".card").forEach((el, i) => { el.style.transitionDelay = Math.min(i, 6) * 0.07 + "s"; });
  initReveal(box);
}

// target 에 목록을 그린다. 처음 한 번만 데이터·로그인 상태를 구독하고, 이후엔 그릴 자리만 바꾼다.
export function mountCourseList(target) {
  box = target;
  courses = null;
  render();
  getDocs(query(collection(db, "courses"), where("published", "==", true)))
    .then((s) => {
      courses = s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title).localeCompare(b.title));
      render();
    })
    .catch((e) => { console.error(e); if (box) box.innerHTML = `<div class="empty">${t("강좌를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "ws.loadErr")}</div>`; });
  if (started) return;
  started = true;
  watchUser(async ({ user }) => {
    myEnr = {};
    if (user) {
      try {
        const s = await getDocs(query(collection(db, "enrollments"), where("uid", "==", user.uid)));
        s.forEach((d) => { const e = toEnr(d.id, d.data()); myEnr[e.courseId] = e; });
      } catch (e) { console.warn("수강권 조회 실패", e); }
    }
    render();
  });
  onLangChange(render);
}
