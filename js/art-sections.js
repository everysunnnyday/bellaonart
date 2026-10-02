// =========================================================
// Art&Design 내용 (디자인 프로세스 + 프로젝트 사진 + 크게 보기) — 메인·Art&Design 페이지 공통
// - 내용의 유일한 기준. 두 페이지 모두 <div id="art-sections"></div> 자리에 이걸로 그린다.
// - 사진 넣는 법: 아래 PORTFOLIO 목록에 '/images/portfolio/파일명' 추가 (권장 3:4 세로, 900x1200)
// =========================================================
import { t, applyLang, onLangChange } from "./i18n.js";

const PORTFOLIO = [
  "/images/portfolio/work-01.png", "/images/portfolio/work-02.png",
  "/images/portfolio/work-03.png", "/images/portfolio/work-04.png",
  "/images/portfolio/work-05.png", "/images/portfolio/work-06.png",
  "/images/portfolio/work-07.png", "/images/portfolio/work-08.png",
];

// 제목 표기: 단어마다 첫 글자만 대문자 (2026-10-03 써니님)
const STEPS = [
  ["Understand", "ad.s1", "공간의 목적과 분위기 분석", '<circle cx="19" cy="19" r="10"/><path d="M27 27l7 7"/>'],
  ["Concept", "ad.s2", "공간 디자인 및 주제와 컨셉 선정", '<path d="M22 7a11 11 0 00-7 19.5V31h14v-4.5A11 11 0 0022 7z"/><path d="M17 35h10M19 39h6"/>'],
  ["Design", "ad.s3", "플로럴 아트 디자인 및 제작", '<circle cx="22" cy="16" r="6"/><path d="M22 22v15"/><path d="M22 30c-6 0-9-4-9-4M22 30c6 0 9-4 9-4"/>'],
  ["Installation", "ad.s4", "플로럴 아트 설치 및 공간연출", '<path d="M22 37s11-9 11-17a11 11 0 10-22 0c0 8 11 17 11 17z"/><circle cx="22" cy="20" r="4"/>'],
];

// asPage = Art&Design 페이지(첫 제목 h1 + 소제목, 메뉴 바로 아래 여백) / 메인은 h2
export function renderArtSections(el, { asPage = false } = {}) {
  const H = asPage ? "h1" : "h2";
  el.innerHTML = `
  <section id="process">
    <div class="wrap sec-inner${asPage ? " page-top" : ""}">
      <div class="sec-head reveal">
        ${asPage ? `<span class="eyebrow">Floral Art &amp; Space Design</span>` : ""}
        <${H} class="section-title">Our Design Process</${H}>
        <span class="rule"></span>
      </div>
      <div class="steps reveal">${STEPS.map(([name, key, ko, icon]) => `
        <div class="step"><span class="line"></span>
          <div class="p-ic"><svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.4">${icon}</svg></div>
          <h4>${name}</h4><p data-i18n="${key}">${ko}</p></div>`).join("")}
      </div>
    </div>
  </section>
  <section id="portfolio" style="background:var(--paper)">
    <div class="wrap sec-inner">
      <div class="sec-head reveal">
        <h2 class="section-title">Art &amp; Design</h2>
        <span class="rule"></span>
      </div>
      <div class="gallery">${PORTFOLIO.map((src, i) => {
        const u = src + "?v=2";   // 캐시 버스터: 파일명이 같아도 새 이미지가 반영되도록
        return `<a href="${u}" class="reveal" data-full="${u}" style="transition-delay:${Math.min(i, 6) * 0.07}s"><div class="ph" style="height:100%"><img src="${u}" alt=""></div></a>`;
      }).join("")}</div>
      <div style="text-align:center;margin-top:44px" class="reveal">
        <a href="https://www.instagram.com/bellaon.art_archive" target="_blank" rel="noopener" class="btn btn-ghost"><span data-i18n="ad.insta">인스타그램에서 더 보기</span> <span>&rarr;</span></a>
      </div>
      <!-- 나중에: 견적 문의·판매 링크 자리 (요청서 3) -->
    </div>
  </section>`;
  applyLang(el);
  const setAlt = () => el.querySelectorAll(".gallery img").forEach((im) => { im.alt = t("벨라온 작품", "ad.workAlt"); });
  setAlt();
  onLangChange(setAlt);
  initLightbox(el.querySelector(".gallery"));
}

// 사진 크게 보기(사이트를 벗어나지 않고)
function initLightbox(gallery) {
  let lb = document.getElementById("lightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.className = "lightbox"; lb.id = "lightbox"; lb.setAttribute("aria-hidden", "true");
    lb.innerHTML = `<button class="lb-close" id="lbClose" type="button" aria-label="${t("닫기", "dlg.close")}">&times;</button><img id="lbImg" src="" alt="">`;
    document.body.appendChild(lb);
  }
  const img = lb.querySelector("#lbImg");
  const open = (src) => { img.src = src; img.alt = t("벨라온 작품", "ad.workAlt"); lb.classList.add("open"); lb.setAttribute("aria-hidden", "false"); document.documentElement.style.overflow = "hidden"; };
  const close = () => { lb.classList.remove("open"); lb.setAttribute("aria-hidden", "true"); document.documentElement.style.overflow = ""; img.src = ""; };
  gallery.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-full]");
    if (a) { e.preventDefault(); open(a.dataset.full); }
  });
  lb.addEventListener("click", (e) => { if (e.target === lb || e.target.id === "lbClose") close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && lb.classList.contains("open")) close(); });
}
