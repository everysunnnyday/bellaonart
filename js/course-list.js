// Workshop 카테고리 카드 · 카테고리별 강의 목록 — 메인·Workshop 페이지·마이페이지가 함께 쓰는 한 곳
// (2026-10-03 써니님 결정)
// - 카테고리 3개는 여기 고정(나중에 필요하면 이 목록만 고친다). 카드 사진·제목·순서 = 메인과 같음
// - 강좌는 관리자 페이지에서 카테고리를 여러 개 고를 수 있다(courses.categories = ["paper-flower", …])
// - 카드를 누르면: 그 카테고리에 공개 강좌가 있으면 강의 목록(/workshop.html?cat=ID), 없으면 '준비 중' 페이지
// - 강의 목록의 강좌 카드 그림 = 1차시 유튜브 썸네일(서버가 대신 가져옴 — common.js thumbOf)
import { db, collection, query, where, getDocs } from "./firebase.js";
import { watchUser, esc, toEnr, initReveal, thumbOf } from "./common.js";
import { enrollState, fmtLeft, fmtPrice } from "./core.js";
import { t, tv, onLangChange } from "./i18n.js";

export const CATEGORIES = [
  { id: "floral-art-design", title: "Floral Art & Design", img: "/images/class/MASTER.png" },
  { id: "paper-flower", title: "Paper Flower", img: "/images/class/paper-flower.jpg" },
  { id: "signature-coloring", title: "Signature Coloring", img: "/images/class/coloring.png" },
];
export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) || null;
const inCat = (course, cat) => Array.isArray(course.categories) && course.categories.includes(cat);

let box = null;          // 지금 그릴 자리
let mode = { kind: "cats", info: false, cat: null };
let courses = null;      // 공개 강좌(관리자 순서)
let myEnr = {};          // courseId → 내 수강권
let started = false;

const leftText = (endAt, now) => fmtLeft(endAt, now, { today: t("오늘 종료", "left.today"), days: t("{d}일 남음", "left.days") });
const delay = (i) => `transition-delay:${Math.min(i, 6) * 0.07}s`;

// ---------- 카테고리 카드 3장 ----------
function catsHtml(shown) {
  return `<div class="edu mfai">${CATEGORIES.map((c, i) => {
    const n = courses ? courses.filter((x) => inCat(x, c.id)).length : null;
    // 강좌를 읽기 전에는 목록 주소로 두고(목록 페이지도 빈 카테고리면 '준비 중' 안내), 읽은 뒤 0개면 준비 중 페이지로
    const href = n === 0 ? "/coming-soon.html" : `/workshop.html?cat=${c.id}`;
    const info = mode.info && n != null
      ? `<p class="meta">${n ? tv("강좌 {n}개", "ws.count", { n }) : t("준비 중", "ws.soon")}</p>` : "";
    return `<a class="card reveal${shown ? " in" : ""}" style="${delay(i)}" href="${href}">
      <div class="ph"><img src="${esc(c.img)}" alt="${esc(c.title)}"></div><h4>${esc(c.title)}</h4>${info}</a>`;
  }).join("")}</div>`;
}

// ---------- 카테고리 안 강의 목록 ----------
function courseInfo(c, now) {
  const meta = c.lessonCount
    ? tv("{n}강 · 총 {min}분", "ws.meta", { n: c.lessonCount, min: Math.round((c.totalSec || 0) / 60) })
    : t("준비 중", "ws.soon");
  const e = myEnr[c.id];
  const st = enrollState(e, now);
  const badge = st === "active" ? `<span class="badge">${tv("수강 중 · {left}", "ws.enrolled", { left: leftText(e.endAt, now) })}</span>`
    : st === "expired" ? `<span class="badge off">${t("기간 종료", "ws.expired")}</span>` : "";
  return `<p class="meta">${esc(meta)}${c.priceLabel ? ` · ${esc(fmtPrice(c.priceLabel))}` : ""}</p>${badge}`;
}
function listHtml(shown) {
  if (!courses) return `<div class="empty">${t("강좌를 불러오는 중…", "ws.loading")}</div>`;
  const list = courses.filter((c) => inCat(c, mode.cat));
  if (!list.length) return `<div class="empty">${t("강좌를 준비하고 있습니다. 곧 만나보실 수 있습니다.", "ws.catEmpty")}</div>`;
  const now = Date.now();
  return `<div class="edu mfai">${list.map((c, i) => `<a class="card reveal${shown ? " in" : ""}" style="${delay(i)}" href="/class/watch.html?c=${encodeURIComponent(c.id)}">
      <div class="ph"><img src="${esc(thumbOf(c, c.id))}" alt="${esc(c.title)}"></div><h4>${esc(c.title)}</h4>${courseInfo(c, now)}</a>`).join("")}</div>`;
}

function render() {
  if (!box || !box.isConnected) return;
  const shown = !!box.querySelector(".card.in");   // 이미 나타난 카드는 다시 그려도 깜빡이지 않게
  box.innerHTML = mode.kind === "list" ? listHtml(shown) : catsHtml(shown);
  initReveal(box);
}

function start() {
  getDocs(query(collection(db, "courses"), where("published", "==", true)))
    .then((s) => {
      courses = s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title).localeCompare(b.title));
      render();
    })
    .catch((e) => { console.error("강좌 목록을 읽지 못함", e); courses = []; render(); });
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

// 카테고리 카드 3장 — info:true(Workshop·마이페이지) 면 카드 아래 "강좌 N개 / 준비 중"
export function mountCategories(target, { info = false } = {}) {
  box = target; mode = { kind: "cats", info, cat: null };
  render(); start();
}
// 한 카테고리의 강의 목록
export function mountCategoryList(target, cat) {
  box = target; mode = { kind: "list", info: true, cat };
  render(); start();
}
