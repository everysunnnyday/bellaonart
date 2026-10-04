// Workshop (/workshop.html[?cat=카테고리ID])
//  - 기본: 카테고리 카드 3장(메인과 같은 사진) + 카드 아래 "강좌 N개 / 준비 중"
//  - ?cat=paper-flower 등: 그 카테고리의 강의 목록(1차시 유튜브 썸네일 · 강좌 정보 · 내 수강 상태)
// 카드·목록 코드는 js/course-list.js 한 곳(메인·마이페이지와 공용)
import { initShell, initReveal, $ } from "./common.js?v=9";
import { mountCategories, mountCategoryList, categoryOf, introHtml } from "./course-list.js?v=9";
import { t, onLangChange } from "./i18n.js?v=9";

initShell({ active: "workshop" });
const cat = categoryOf(new URLSearchParams(location.search).get("cat"));

if (cat) {
  // 제목을 카테고리 이름으로 · 아래에 Workshop 으로 돌아가는 링크
  const head = $(".sec-head");
  head.querySelector(".section-title").textContent = cat.title;
  const back = document.createElement("a");
  back.className = "back-link";
  back.href = "/workshop.html";
  const label = () => { back.textContent = t("← 전체 Workshop", "ws.back"); };
  label(); onLangChange(label);
  head.appendChild(back);
  document.title = `${cat.title} | ${document.title}`;
  // 카테고리 소개(사진 왼쪽 · 글 오른쪽) — 강의 목록 바로 위. 소개 글이 없는 카테고리는 아무것도 안 넣음
  if (cat.intro) {
    const intro = document.createElement("div");
    $("#list").before(intro);
    const draw = () => { intro.innerHTML = introHtml(cat); };
    draw(); onLangChange(draw);
  }
  mountCategoryList($("#list"), cat.id);
} else {
  mountCategories($("#list"), { info: true });
}
initReveal();
