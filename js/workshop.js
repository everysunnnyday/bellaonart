// Workshop (/workshop.html) — 공개 강좌 카드(관리자가 정한 순서) + 로그인 시 내 수강 상태
// 목록 코드는 js/course-list.js 한 곳(마이페이지와 공용)
import { initShell, initReveal, $ } from "./common.js";
import { mountCourseList } from "./course-list.js";

initShell({ active: "workshop" });
mountCourseList($("#list"));
initReveal();
