// =========================================================
// 한/영 전환 (docs/03 §3)
// - 한국어 = 각 HTML 에 그대로(검색 노출). 영문 = 이 파일 EN 한 곳에만.
// - HTML: <p data-i18n="키">한국어</p> · 속성은 data-i18n-attr="alt:키;placeholder:키2"
// - JS 문구: t("한국어", "키") / tv("한국어 {n}", "키", { n })
// - ⚠ 영문은 클로드 초안 — 대표님 확인 필요(2026-10-03)
// =========================================================

export const EN = {
  // ---- 상단 · 공통 ----
  "nav.hello": "Hi, {name}",   // 메뉴 이름(Log in·My Page 등)은 한/영 모두 영문이라 여기 없음
  "kakao.label": "KakaoTalk",
  "kakao.aria": "Chat with us on KakaoTalk",
  "inapp.bar": "Google sign-in doesn't work inside in-app browsers.",
  "inapp.btn": "Open in browser",
  "inapp.title": "Please open in your browser",
  "inapp.body": "<b>Google sign-in</b> is blocked inside apps like KakaoTalk or Instagram.<br>Open this page in Chrome or Safari to sign in.<br><span class='small muted'>If you signed up with email, you can log in with email here.</span>",
  "inapp.open": "Open in browser",
  "inapp.copy": "Copy link",
  "inapp.copied": "Link copied. Paste it into Safari or Chrome.",
  "inapp.copyFail": "Use the menu to choose 'Open in another browser'.",
  "ft.name": "Company",
  "ft.ceo": "CEO",
  "ft.bizNo": "Business Reg. No.",
  "ft.mailOrder": "Mail-order Reg. No.",
  "ft.addr": "Address",
  "ft.phone": "Tel",
  "ft.email": "Email",
  "dlg.ok": "OK",
  "dlg.cancel": "Cancel",
  "dlg.close": "Close",
  "notReady": "Our member system is being prepared.",

  // ---- 로그인 창 ----
  "auth.title": "BELLAON Class",
  "auth.google": "Continue with Google",
  "auth.or": "or with email",
  "auth.tabIn": "Log in",
  "auth.tabUp": "Sign up",
  "auth.name": "Name",
  "auth.email": "Email",
  "auth.pw": "Password",
  "auth.pwHint": "At least 8 characters",
  "auth.pw2": "Confirm password",
  "auth.submitIn": "Log in",
  "auth.submitUp": "Create account",
  "auth.reset": "Forgot your password?",
  "auth.needName": "Please enter your name.",
  "auth.pwShort": "Please use at least 8 characters.",
  "auth.pwMismatch": "Passwords do not match.",
  "auth.resetNeedEmail": "Please enter the email you signed up with first.",
  "auth.resetSent": "We sent a password reset email. Please check your inbox (and spam folder).",
  "auth.sentTitle": "Verification email sent",
  "auth.sentBody": "Please click the link in the email we sent to <b>{email}</b>.<br><span class='small muted'>Check your spam folder if you can't find it. You can watch classes after verifying.</span>",
  "err.exists": "This email is already registered. Please log in, or use [Continue with Google] if you signed up with Google.",
  "err.cred": "The email or password is incorrect.",
  "err.email": "Please check the email address.",
  "err.weak": "Please use at least 8 characters.",
  "err.missingPw": "Please enter your password.",
  "err.many": "Too many attempts. Please try again later.",
  "err.net": "Please check your internet connection.",
  "err.popup": "The pop-up was blocked. Allow pop-ups in the address bar and try again.",
  "err.generic": "Something went wrong. Please try again later. ({code})",

  // ---- 메인 ----
  "home.heroAlt": "Giant flower installation by BELLAON ART in a seaside lobby",
  "home.aboutTitle": "We design spaces through the form and color of flowers.",
  "home.aboutBody": "BELLAON ART is a floral art studio that creates paper flowers and giant flowers, and installs and styles them to suit each space.<br><br>Based on the purpose of the space and the story of the brand, we choose the materials, colors and forms, and stay with you from making to installation. The experience and techniques built through our work are shared in our classes.",

  "aria.menu": "Main menu",
  "aria.burger": "Open menu",

  // ---- About ----
  "about.figAlt": "Giant paper flower installation by BELLAON ART",
  "about.lead": "We think about the harmony between flowers and space.",
  "about.p1": "A space shapes the experience of the people who spend time in it. Good design raises the value of a space and feels natural in everyday life. BELLAON ART begins every project by thinking about where the flowers will be placed and the people who will visit.",
  "about.p2": "From small paper flowers to large floral objects, spatial installations and displays — we design and make each piece to suit how the space is used and the story the brand wants to tell.",
  "about.p3": "We look closely at the texture of materials, the shape of each petal and subtle differences in color, and balance the whole with light and negative space in mind. We value both the finish seen up close and the harmony felt across the entire space.",
  "about.p4": "This experience carries into our classes. We share everything from handling materials and making flowers to combining colors and composing forms, guiding you to create your own work and apply the techniques to new projects.",
  "about.p5": "We hope BELLAON ART's flowers blend naturally into each space and stay long in the memory of those who visit.",

  // ---- Art&Design ----
  "ad.s1": "Analyzing the purpose and mood of the space",
  "ad.s2": "Space design, theme and concept",
  "ad.s3": "Floral art design and production",
  "ad.s4": "Floral art installation and spatial styling",
  "ad.insta": "See more on Instagram",
  "ad.workAlt": "BELLAON ART work",

  // ---- Workshop ----
  "ws.loading": "Loading classes…",
  "ws.empty": "New classes are coming soon.",
  "ws.loadErr": "We couldn't load the classes. Please try again later.",
  "ws.enrolled": "Enrolled · {left}",
  "ws.expired": "Expired",
  "ws.meta": "{n} lessons · {min} min",
  "ws.soon": "Coming soon",
  "ws.count": "{n} classes",
  "ws.catEmpty": "Classes are being prepared. Please check back soon.",
  "ws.back": "← All Workshops",
  // ---- 카테고리 소개 (js/course-list.js CATEGORIES intro) · 클로드 초안, 대표님 확인 필요 ----
  "cat.paper-flower.head": "Looking closely at flowers,<br>and making them slowly.",
  "cat.paper-flower.p1": "When you make a single flower, you begin to notice details you usually pass by — the way a petal curves, how the layers overlap, the subtle difference in color between the inside and the outside. Paper flowers begin with looking closely at nature.",
  "cat.paper-flower.p2": "To the charm you discover, you add your own imagination. Sometimes you recreate a favorite flower as faithfully as you can; sometimes you give it a color nature never made, or reshape its petals. The joy of resemblance and the joy of free change — the charm of paper flowers lies somewhere in between.",
  "cat.paper-flower.p3": "Shaping petals and attaching them one by one takes time. As your hands move and your attention settles on the flower in front of you, a busy mind slowly grows quiet. Rather than rushing to finish, enjoy watching the flower take shape little by little.",
  "cat.paper-flower.p4": "Place the flower you made somewhere close to your everyday life. Each time you look at it, you will remember the time you spent choosing its colors and shaping it by hand.",
  "cat.paper-flower.p5": "Discover a new way of seeing flowers, and the joy of making them yourself, in BELLAON ART's classes.",
  "left.days": "{d} days left",
  "left.today": "Ends today",
  "left.none": "No time limit",

  // ---- 계정 확인 (/auth/action.html — 인증·재설정 메일 링크) ----
  "act.bad": "This link has expired or has already been used.<br>Please request a new email if needed.",
  "act.fail": "Something went wrong. Please try again later.",
  "act.verified": "Your email has been verified.<br>Log in to start watching your classes.",
  "act.resetTitle": "Set a new password",
  "act.pw": "New password (at least 8 characters)",
  "act.pw2": "Confirm new password",
  "act.resetBtn": "Change password",
  "act.resetDone": "Your password has been changed. Please log in with your new password.",
  "act.recovered": "Your email address has been restored to <b>{email}</b>.",
  "act.noCode": "This link is not valid.",

  // ---- 강좌 상세 (/class/watch.html) ----
  "cd.siteTitle": "BELLAON Online Class",
  "cd.badUrl": "This class link is not valid.",
  "cd.notFound": "We couldn't find this class.",
  "cd.openFail": "We couldn't open the classroom. Please try again later.",
  "cd.price": "Fee",
  "cd.parts": "Lessons",
  "cd.partsVal": "{n} lessons · {d} total",
  "cd.period": "Access",
  "cd.periodVal": "{d} days · one free extension of +{e} days",
  "cd.periodFree": "No time limit",
  "cd.free": "Free",
  "cd.materials": "Materials",
  "cd.about": "About This Class",
  "cd.outline": "Curriculum",
  "cd.noLessons": "The lesson videos are being prepared.",
  "cd.needLogin": "Log in to apply for this class or enter a class code.",
  "cd.freeLogin": "This class is free for all members. Please log in to start.",
  "cd.login": "Log in / Sign up",
  "cd.apply1": "Apply via KakaoTalk and we'll let you know how to pay.",
  "cd.apply2": "Once your payment is confirmed, we'll send you a class code.",
  "cd.applyKakao": "Apply on KakaoTalk",
  "cd.expired": "Your access period has ended. (Ended {d})",
  "cd.upcoming": "Your class starts on {d}.",
  "cd.revoked": "You don't have access to this class. Please contact us.",
  "cd.askKakao": "Ask on KakaoTalk",
  "cd.codeQ": "Already have a class code?",
  "cd.codeSub": "Register your code to start the class.",
  "cd.codePh": "Enter class code",
  "cd.codeBtn": "Register code",
  "cd.codeEmpty": "Please enter a code.",
  "cd.codeWait": "Checking…",
  "cd.codeOk": "Your access is ready. Start learning now!",
  "cd.r.auth": "Please log in first.",
  "cd.r.unverified": "Please verify your email first.",
  "cd.r.many": "Too many incorrect codes. Please try again in an hour.",
  "cd.r.invalid": "Please check the code and try again.",
  "cd.r.stopped": "This code is no longer active.",
  "cd.r.expired": "This code has expired.",
  "cd.r.full": "This code has reached its limit.",
  "cd.r.used": "You have already used this code.",
  "cd.r.course": "This class is not open for enrollment right now.",
  "cd.r.enrolled": "You are already enrolled in this class.",
  "cd.r.revoked": "Your access to this class was withdrawn. Please contact us.",
  "cd.r.notReady": "Enrollment isn't open yet. Please contact us.",
  "cd.r.fail": "Something went wrong. Please try again later.",

  // ---- Shop ----
  "shop.body": "We are preparing class kits and floral goods.<br>Please stay tuned.",
  "shop.tag": "Coming Soon",

  "soon.body": "This class is being prepared.<br>It will be available soon.",

  // ---- Contact ----
  "ct.head": "Beyond the beauty of space,<br>we design value that stays in life.",
  "ct.addr": "No. 2, 53-1 Nunso 9-gil, Gwangyang-si",
  "ct.name": "Name <i>*</i>",
  "ct.namePh": "Your name",
  "ct.contact": "Email or phone <i>*</i>",
  "ct.msg": "Message <i>*</i>",
  "ct.msgPh": "Tell us about your project, class or workshop inquiry.",
  "ct.consent": "I agree to the collection and use of my personal information. <small>(Collected: name and contact · Purpose: replying to your inquiry · Kept until handled, then deleted)</small>",
  "ct.send": "Send",
  "ct.sending": "Sending…",
  "ct.ok": "✓ Your message has been sent. We'll get back to you soon.",
  "ct.fail": "Sending failed. Please try again later or email bellaon_art@naver.com.",
  "ct.net": "A network error occurred. Please email bellaon_art@naver.com.",
};

const KEY = "bellaon.lang";
let lang = (() => { try { return localStorage.getItem(KEY) === "en" ? "en" : "ko"; } catch { return "ko"; } })();
export const getLang = () => lang;

// JS 안의 문구: 한국어를 그대로 쓰고, 영어일 때만 EN[key]
export const t = (ko, key) => (lang === "en" && EN[key] != null ? EN[key] : ko);
// 값이 들어가는 문구: "{n}" 자리 채우기 (한국어 템플릿도 같은 방식)
export const tv = (ko, key, vars = {}) => t(ko, key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

const listeners = new Set();
export const onLangChange = (fn) => listeners.add(fn);

const koHtml = new WeakMap();   // 요소 → 원래 한국어 innerHTML
const koAttr = new WeakMap();   // 요소 → { 속성: 원래 한국어 }

export function applyLang(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    if (!koHtml.has(el)) koHtml.set(el, el.innerHTML);
    const en = EN[el.dataset.i18n];
    el.innerHTML = lang === "en" && en != null ? en : koHtml.get(el);
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    const saved = koAttr.get(el) || {};
    el.dataset.i18nAttr.split(";").forEach((pair) => {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (!(attr in saved)) saved[attr] = el.getAttribute(attr) ?? "";
      el.setAttribute(attr, lang === "en" && EN[key] != null ? EN[key] : saved[attr]);
    });
    koAttr.set(el, saved);
  });
}

export function setLang(l) {
  lang = l === "en" ? "en" : "ko";
  try { localStorage.setItem(KEY, lang); } catch { /* 저장 불가 환경은 이번 방문만 */ }
  applyLang();
  listeners.forEach((fn) => fn(lang));
}
