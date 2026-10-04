// =========================================================
// Contact 내용 (연락처 + 문의 폼 + 보내기) — 메인·Contact 페이지 공통
// - 내용의 유일한 기준. 두 페이지 모두 <div id="contact-section"></div> 자리에 이걸로 그린다.
// - 문의 폼은 Web3Forms (bellaon_art@naver.com 수신)
// =========================================================
import { t, applyLang } from "./i18n.js?v=12";

const ICON = {
  // 전화기 모양 (예전엔 봉투 모양이었음 — 2026-10-03 써니님 요청으로 변경)
  phone: '<path d="M6.5 3.5h2l1.2 3.2-1.6 1.1a8.5 8.5 0 004.1 4.1l1.1-1.6 3.2 1.2v2a1.5 1.5 0 01-1.6 1.5A12.5 12.5 0 015 5.1 1.5 1.5 0 016.5 3.5z"/>',
  mail: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 6l7 5 7-5"/>',
  insta: '<rect x="3" y="3" width="14" height="14" rx="4"/><circle cx="10" cy="10" r="3.5"/><circle cx="14.5" cy="5.5" r="1" fill="currentColor" stroke="none"/>',
  pin: '<path d="M10 18s6-5.3 6-10a6 6 0 10-12 0c0 4.7 6 10 6 10z"/><circle cx="10" cy="8" r="2.2"/>',
};
const ic = (name) => `<span class="ic"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4">${ICON[name]}</svg></span>`;

// asPage = Contact 페이지(제목 h1) / 메인은 h2
export function renderContact(el, { asPage = false } = {}) {
  const H = asPage ? "h1" : "h2";
  el.innerHTML = `
  <section id="contact" class="contact">
    <div class="wrap sec-inner">
      <div class="contact-grid">
        <div class="reveal">
          <span class="eyebrow">Contact</span>
          <${H} class="contact-title" data-i18n="ct.head">공간의 아름다움을 넘어,<br>삶에 머무는 가치를 디자인합니다.</${H}>
          <ul class="contact-list">
            <li>${ic("phone")}<a href="tel:01073025170">010-7302-5170</a></li>
            <li>${ic("mail")}<a href="mailto:bellaon_art@naver.com">bellaon_art@naver.com</a></li>
            <li>${ic("insta")}<a href="https://www.instagram.com/bellaon_art" target="_blank" rel="noopener">@bellaon_art</a></li>
            <li>${ic("pin")}<span data-i18n="ct.addr">광양시 눈소9길 53-1 2호</span></li>
          </ul>
        </div>

        <form class="contact-form reveal" action="https://api.web3forms.com/submit" method="POST">
          <input type="hidden" name="access_key" value="5fcc5dad-47a5-44b2-b7d5-cc4e59220ad7" />
          <input type="hidden" name="subject" value="[벨라온 홈페이지] 새 문의가 도착했습니다" />
          <input type="hidden" name="from_name" value="BELLAON 홈페이지" />
          <input type="checkbox" name="botcheck" class="hp-field" tabindex="-1" autocomplete="off" />
          <div class="field-row">
            <label class="field">
              <span data-i18n="ct.name">이름 <i>*</i></span>
              <input type="text" name="이름" required placeholder="홍길동" data-i18n-attr="placeholder:ct.namePh" />
            </label>
            <label class="field">
              <span data-i18n="ct.contact">연락처 (이메일 또는 전화) <i>*</i></span>
              <input type="text" name="연락처" required placeholder="name@email.com / 010-0000-0000" />
            </label>
          </div>
          <label class="field">
            <span data-i18n="ct.msg">문의 내용 <i>*</i></span>
            <textarea name="문의내용" rows="4" required placeholder="제작 의뢰, 클래스, 출강 등 문의 내용을 자유롭게 남겨주세요." data-i18n-attr="placeholder:ct.msgPh"></textarea>
          </label>
          <label class="consent">
            <input type="checkbox" name="개인정보수집동의" value="동의함" required />
            <span data-i18n="ct.consent">개인정보 수집·이용에 동의합니다. <small>(수집: 이름·연락처 · 목적: 문의 응대 · 보유: 처리 후 파기)</small></span>
          </label>
          <button type="submit" class="submit-btn" data-i18n="ct.send">문의 보내기</button>
          <p class="form-result" role="status" aria-live="polite"></p>
        </form>
      </div>
    </div>
  </section>`;
  applyLang(el);
  bindForm(el.querySelector(".contact-form"));
}

function bindForm(form) {
  const result = form.querySelector(".form-result");
  const setResult = (msg, cls) => { result.textContent = msg; result.className = "form-result" + (cls ? " " + cls : ""); };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector(".submit-btn");
    setResult(t("전송 중입니다…", "ct.sending"), "");
    btn.disabled = true;
    try {
      const r = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      const data = await r.json();
      if (data.success) { form.reset(); setResult(t("✓ 문의가 정상적으로 전송되었습니다. 빠르게 회신드리겠습니다.", "ct.ok"), "ok"); }
      else setResult(t("전송에 실패했습니다. 잠시 후 다시 시도하시거나 bellaon_art@naver.com 으로 메일 주세요.", "ct.fail"), "err");
    } catch {
      setResult(t("네트워크 오류로 전송하지 못했습니다. bellaon_art@naver.com 으로 메일 주세요.", "ct.net"), "err");
    } finally {
      btn.disabled = false;
    }
  });
}
