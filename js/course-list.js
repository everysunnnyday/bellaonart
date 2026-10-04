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

// intro = 카테고리 강의 목록 위에 나오는 소개(사진 왼쪽 · 글 오른쪽). 한국어는 여기, 영문은 i18n.js(cat.<id>.*)
//         소개가 없는 카테고리는 제목·목록만 보인다. 문단은 body 배열 한 칸 = 한 문단.
export const CATEGORIES = [
  { id: "floral-art-design", title: "Floral Art & Design", img: "/images/class/MASTER.png" },
  { id: "paper-flower", title: "Paper Flower", img: "/images/class/paper-flower.jpg",
    intro: {   // 2026-10-04 써니님 제공 글
      img: "/images/class/paper-flower-intro.webp",
      head: "꽃을 들여다보고,<br>천천히 만들어가는 시간.",
      body: [
        "꽃 한 송이를 만들다 보면 평소에는 지나쳤던 모습들이 눈에 들어옵니다. 꽃잎이 휘어지는 방향, 겹쳐진 모양, 안쪽과 바깥쪽의 미묘한 색 차이까지. 페이퍼 플라워는 자연을 자세히 바라보는 데서 시작합니다.",
        "그렇게 발견한 꽃의 매력에 나의 상상을 더합니다. 좋아하는 꽃을 실제 모습에 가깝게 만들기도 하고, 자연에는 없는 색을 입히거나 꽃잎의 모양을 바꾸기도 합니다. 닮게 만드는 즐거움과 자유롭게 바꾸는 즐거움, 그 사이에 페이퍼 플라워의 매력이 있습니다.",
        "꽃잎을 다듬고 한 장씩 붙이는 데에는 시간이 걸립니다. 손을 움직이며 눈앞의 꽃에 집중하다 보면, 분주했던 생각도 조금씩 잦아듭니다. 서둘러 완성하기보다 꽃이 조금씩 모습을 갖춰가는 과정을 즐겨보세요.",
        "직접 만든 꽃을 일상 가까이에 놓아보세요. 꽃을 바라볼 때마다 그 색을 고르고 손으로 다듬었던 시간도 함께 떠오를 거예요.",
        "벨라온아트의 클래스에서 꽃을 바라보는 새로운 시선과 직접 만드는 즐거움을 만나보세요.",
      ],
    } },
  { id: "signature-coloring", title: "Signature Coloring", img: "/images/class/coloring.png" },
];

// 카테고리 소개 HTML(소개가 없으면 빈 글자). 한/영은 i18n.js 의 cat.<id>.head / cat.<id>.p1… 키
export function introHtml(cat) {
  const it = cat?.intro;
  if (!it) return "";
  return `<div class="cat-intro">
    <div class="ci-img"><img src="${esc(it.img)}" alt="${esc(cat.title)}"></div>
    <div class="ci-text">
      <h2>${t(it.head, `cat.${cat.id}.head`)}</h2>
      ${it.body.map((p, i) => `<p>${t(esc(p), `cat.${cat.id}.p${i + 1}`)}</p>`).join("")}
    </div>
  </div>`;
}
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
  // 강의 목록 카드 = 한 줄 3개 · 16:9 썸네일(1차시 유튜브 썸네일과 같은 비율이라 잘리지 않음) — 2026-10-04 써니님
  return `<div class="edu course-grid">${list.map((c, i) => `<a class="card reveal${shown ? " in" : ""}" style="${delay(i)}" href="/class/watch.html?c=${encodeURIComponent(c.id)}">
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
