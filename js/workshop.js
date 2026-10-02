// Workshop (/workshop.html) — 공개 강좌 카드(관리자가 정한 순서) + 로그인 시 내 수강 상태
// (예전 /class/ 목록 페이지를 대신함 — 강좌 목록은 이 한 곳)
import { db, collection, query, where, getDocs } from "./firebase.js";
import { initShell, initReveal, watchUser, esc, $, toEnr, DEFAULT_THUMB } from "./common.js";
import { enrollState, fmtLeft } from "./core.js";
import { t, tv, onLangChange } from "./i18n.js";

initShell({ active: "workshop" });
const box = $("#list");
let courses = null;
let myEnr = {};   // courseId → 수강권

// 남은 일수 계산은 core.js 한 곳 — 여기서는 문구만 언어에 맞게 넘긴다
const leftText = (endAt, now) => fmtLeft(endAt, now, { today: t("오늘 종료", "left.today"), days: t("{d}일 남음", "left.days") });

function render() {
  if (!courses) return;
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

getDocs(query(collection(db, "courses"), where("published", "==", true)))
  .then((s) => {
    courses = s.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title).localeCompare(b.title));
    render();
  })
  .catch((e) => { console.error(e); box.innerHTML = `<div class="empty">${t("강좌를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "ws.loadErr")}</div>`; });

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
initReveal();
