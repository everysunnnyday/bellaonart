// 보안 규칙 검사 (firestore.rules) — "막혀야 할 것이 실제로 막히는지" 에뮬레이터에서 확인
// 실행: npm test (firebase 폴더 · Java 필요 · 에뮬레이터를 켰다가 끝나면 끈다)
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { DEFAULT_POLICY, DAY, kstDateStr, startOfKstDay, endOfKstDay } from "../../js/core.js";

let env;
const NOW = Date.now();
const today = kstDateStr(NOW);
const endIn = (n) => Timestamp.fromMillis(endOfKstDay(kstDateStr(NOW + n * DAY)));
const startAgo = (n) => Timestamp.fromMillis(startOfKstDay(kstDateStr(NOW - n * DAY)));

// 사람별 접속(이메일 인증 여부 포함)
const as = (uid, email, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const admin = () => as("adm", "sun0873@gmail.com");
const admin2 = () => as("adm2", "bellaon.art@gmail.com");
const fakeAdmin = () => as("fake", "sun0873@gmail.com", false);   // 이메일 미인증이면 관리자 아님
const stu = () => as("stu", "stu@x.com");
const unv = () => as("unv", "unv@x.com", false);
const other = () => as("oth", "oth@x.com");
const anon = () => env.unauthenticatedContext().firestore();

const enr = (uid, cid, o = {}) => ({ uid, courseId: cid, status: "active", startAt: startAgo(5), endAt: endIn(20),
  extendedCount: 0, source: "admin", grantedBy: "sun0873@gmail.com", memo: "", ...o });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-bellaon",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8285 },
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const put = (p, d) => setDoc(doc(db, p), d);
    await put("config/admins", { emails: ["sun0873@gmail.com", "bellaon.art@gmail.com"] });
    await put("config/policy", { ...DEFAULT_POLICY });
    await put("courses/pub", { title: "공개", published: true });
    await put("courses/hid", { title: "비공개", published: false });
    await put("courses/pub/lessons/l1", { title: "1강", youtubeId: "o-Jmog-ltFY", durationSec: 100, order: 1 });
    await put("courses/hid/lessons/l1", { title: "1강", youtubeId: "6cid1r_gQ3E", durationSec: 100, order: 1 });
    await put("enrollments/stu_pub", enr("stu", "pub"));
    await put("enrollments/stu_hid", enr("stu", "hid"));
    await put("enrollments/unv_pub", enr("unv", "pub"));
    await put("enrollments/exp_pub", enr("exp", "pub", { startAt: startAgo(40), endAt: endIn(-2) }));
    await put("enrollments/rev_pub", enr("rev", "pub", { status: "revoked" }));
    await put("enrollments/fut_pub", enr("fut", "pub", { startAt: Timestamp.fromMillis(startOfKstDay(kstDateStr(NOW + 3 * DAY))) }));
    await put("enrollments/e10_pub", enr("e10", "pub", { endAt: endIn(9) }));    // 오늘 포함 10일 남음 = 연장 가능 첫날
    await put("enrollments/e11_pub", enr("e11", "pub", { endAt: endIn(10) }));   // 오늘 포함 11일 남음 = 하루 이름
    await put("enrollments/e5_pub", enr("e5", "pub", { endAt: endIn(5) }));
    await put("enrollments/did_pub", enr("did", "pub", { endAt: endIn(5), extendedCount: 1 }));
    await put("users/stu", { name: "학생", email: "stu@x.com" });
    await put("progress/stu_pub", { uid: "stu", courseId: "pub", lessons: {} });
  });
});

// ---------- 관리자 판정 ----------
test("관리자 명단: 관리자 2명은 읽힘 · 학생/미인증 사칭은 못 읽음 · 아무도 못 고침", async () => {
  await assertSucceeds(getDoc(doc(admin(), "config/admins")));
  await assertSucceeds(getDoc(doc(admin2(), "config/admins")));
  await assertFails(getDoc(doc(stu(), "config/admins")));
  await assertFails(getDoc(doc(fakeAdmin(), "config/admins")));
  await assertFails(setDoc(doc(admin(), "config/admins"), { emails: ["x@x.com"] }));
});

test("운영 기준: 누구나 읽기 · 관리자만 처음 생성 · 이후 수정은 관리자도 불가", async () => {
  await assertSucceeds(getDoc(doc(anon(), "config/policy")));
  await assertFails(updateDoc(doc(admin(), "config/policy"), { completeRatio: 0.5 }));
  await env.withSecurityRulesDisabled((c) => deleteDoc(doc(c.firestore(), "config/policy")));
  await assertFails(setDoc(doc(stu(), "config/policy"), { ...DEFAULT_POLICY }));
  await assertFails(setDoc(doc(admin(), "config/policy"), { ...DEFAULT_POLICY, extra: 1 }));
  await assertSucceeds(setDoc(doc(admin(), "config/policy"), { ...DEFAULT_POLICY }));
});

// ---------- 회원 ----------
test("회원 정보: 본인만 생성·읽기 · 이메일 위조·다른 칸 불가 · 관리자는 목록", async () => {
  const me = { name: "새", email: "oth@x.com", photoURL: "", provider: "password", createdAt: serverTimestamp(), lastLoginAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(other(), "users/oth"), me));
  await assertFails(setDoc(doc(other(), "users/stu"), me));
  await assertFails(setDoc(doc(other(), "users/oth"), { ...me, email: "admin@x.com" }));
  await assertFails(setDoc(doc(other(), "users/oth"), { ...me, role: "admin" }));
  await assertFails(getDoc(doc(other(), "users/stu")));
  await assertSucceeds(getDocs(collection(admin(), "users")));
  await assertFails(getDocs(collection(stu(), "users")));
});

test("마이페이지: 본인 연락처 저장(20자 이하) · 남의 정보 삭제 불가 · 본인 탈퇴(삭제) 가능", async () => {
  await assertSucceeds(updateDoc(doc(stu(), "users/stu"), { name: "새이름", phone: "010-1234-5678" }));
  await assertFails(updateDoc(doc(stu(), "users/stu"), { phone: "0".repeat(21) }));
  await assertFails(updateDoc(doc(stu(), "users/stu"), { phone: 1012345678 }));
  await assertFails(deleteDoc(doc(other(), "users/stu")));
  await assertFails(deleteDoc(doc(admin(), "users/stu")));
  await assertSucceeds(deleteDoc(doc(stu(), "users/stu")));
});

// ---------- 강좌 ----------
test("강좌: 공개는 누구나 · 비공개는 관리자와 수강권 있던 회원만 · 쓰기는 관리자만", async () => {
  await assertSucceeds(getDoc(doc(anon(), "courses/pub")));
  await assertFails(getDoc(doc(anon(), "courses/hid")));
  await assertFails(getDoc(doc(other(), "courses/hid")));
  await assertSucceeds(getDoc(doc(stu(), "courses/hid")));
  await assertSucceeds(getDocs(query(collection(anon(), "courses"), where("published", "==", true))));
  await assertFails(getDocs(collection(anon(), "courses")));
  await assertFails(setDoc(doc(stu(), "courses/new"), { title: "x", published: true }));
  await assertSucceeds(setDoc(doc(admin(), "courses/new-1"), { title: "x", published: false }));
  await assertFails(setDoc(doc(admin(), "courses/Bad_ID"), { title: "x" }));      // ID 규칙(밑줄 금지)
  await assertFails(deleteDoc(doc(admin(), "courses/pub")));
});

// ---------- 차시(유튜브 ID) ----------
test("차시: 유효 수강권 + 인증된 회원만 · 비로그인/미수강/만료/회수/시작 전/미인증 차단", async () => {
  await assertSucceeds(getDocs(collection(stu(), "courses/pub/lessons")));
  await assertSucceeds(getDocs(collection(admin(), "courses/pub/lessons")));
  await assertFails(getDocs(collection(anon(), "courses/pub/lessons")));
  await assertFails(getDocs(collection(other(), "courses/pub/lessons")));
  await assertFails(getDocs(collection(as("exp", "exp@x.com"), "courses/pub/lessons")));
  await assertFails(getDocs(collection(as("rev", "rev@x.com"), "courses/pub/lessons")));
  await assertFails(getDocs(collection(as("fut", "fut@x.com"), "courses/pub/lessons")));
  await assertFails(getDocs(collection(unv(), "courses/pub/lessons")));
  await assertFails(getDoc(doc(other(), "courses/pub/lessons/l1")));
  await assertFails(setDoc(doc(stu(), "courses/pub/lessons/l2"), { title: "x" }));
});

// ---------- 수강권 ----------
test("수강권: 본인 것만 보기 · 회원은 만들기·지우기 불가 · 관리자는 ID 맞춰서만 생성", async () => {
  await assertSucceeds(getDoc(doc(stu(), "enrollments/stu_pub")));
  await assertSucceeds(getDoc(doc(other(), "enrollments/oth_pub")));        // 없는 내 것 조회는 허용(없음 확인용)
  await assertFails(getDoc(doc(other(), "enrollments/stu_pub")));
  await assertSucceeds(getDocs(query(collection(stu(), "enrollments"), where("uid", "==", "stu"))));
  await assertFails(getDocs(collection(stu(), "enrollments")));
  await assertFails(setDoc(doc(other(), "enrollments/oth_pub"), enr("oth", "pub")));
  await assertSucceeds(setDoc(doc(admin(), "enrollments/oth_pub"), enr("oth", "pub")));
  await assertFails(setDoc(doc(admin(), "enrollments/oth_hid"), enr("oth", "pub")));   // 문서 ID 불일치
  await assertFails(deleteDoc(doc(admin(), "enrollments/stu_pub")));
  await assertFails(updateDoc(doc(stu(), "enrollments/stu_pub"), { endAt: endIn(100) }));
});

// ---------- 연장 (D12) ----------
// withSecurityRulesDisabled 는 콜백의 반환값을 돌려주지 않으므로 바깥 변수에 담는다
const rawEnr = async (id) => {
  let data;
  await env.withSecurityRulesDisabled(async (c) => { data = (await getDoc(doc(c.firestore(), "enrollments", id))).data(); });
  return data;
};
const EXT = DEFAULT_POLICY.extendDays;   // 60일 (D16)
const extendTo = async (db, id, days = EXT) => {
  const cur = await rawEnr(id);
  return updateDoc(doc(db, "enrollments", id), {
    endAt: Timestamp.fromMillis(cur.endAt.toMillis() + days * DAY), extendedCount: 1, extendedAt: serverTimestamp(),
  });
};
test("연장(D17): 수강 중이면 남은 기간과 무관하게 +60일 1회 허용", async () => {
  await assertSucceeds(extendTo(as("e10", "e10@x.com"), "e10_pub"));
  await assertSucceeds(extendTo(as("e11", "e11@x.com"), "e11_pub"));
  await assertSucceeds(extendTo(as("e5", "e5@x.com"), "e5_pub"));
  await assertSucceeds(extendTo(stu(), "stu_pub"));                       // 21일 남음
});
test("연장 거부: 시작 전 · 이미 연장 · 일수 위조 · 남의 것 · 만료 후 · 회수 · 미인증 · 다른 칸 같이 변경", async () => {
  await assertFails(extendTo(as("fut", "fut@x.com"), "fut_pub"));
  await assertFails(extendTo(as("rev", "rev@x.com"), "rev_pub"));
  await assertFails(extendTo(as("did", "did@x.com"), "did_pub"));
  await assertFails(extendTo(as("e5", "e5@x.com"), "e5_pub", EXT + 1));
  await assertFails(extendTo(as("e5", "e5@x.com"), "e5_pub", EXT * 2));
  await assertFails(extendTo(as("e5", "e5@x.com"), "e5_pub", 30));       // 예전 기준(30일)도 거부
  await assertFails(extendTo(stu(), "e5_pub"));
  await assertFails(extendTo(as("exp", "exp@x.com"), "exp_pub"));
  await assertFails(extendTo(as("e5", "e5@x.com", false), "e5_pub"));
  const cur = await rawEnr("e5_pub");
  await assertFails(updateDoc(doc(as("e5", "e5@x.com"), "enrollments/e5_pub"), {
    endAt: Timestamp.fromMillis(cur.endAt.toMillis() + EXT * DAY), extendedCount: 1, extendedAt: serverTimestamp(), memo: "x" }));
  await assertFails(updateDoc(doc(as("e5", "e5@x.com"), "enrollments/e5_pub"), {
    endAt: Timestamp.fromMillis(cur.endAt.toMillis() + EXT * DAY), extendedCount: 1, extendedAt: Timestamp.fromMillis(NOW - DAY) }));
});

// ---------- 진도 ----------
const prog = (uid, cid, o = {}) => ({ uid, courseId: cid, lessons: { l1: { seg: [0, 10], lastPos: 10, done: false } }, updatedAt: serverTimestamp(), ...o });
test("진도: 유효 수강권 있는 본인만 저장 · 남의 진도·만료·미인증·다른 칸 불가", async () => {
  await assertSucceeds(setDoc(doc(stu(), "progress/stu_pub"), prog("stu", "pub"), { merge: true }));
  await assertFails(setDoc(doc(stu(), "progress/oth_pub"), prog("oth", "pub")));
  await assertFails(setDoc(doc(stu(), "progress/stu_pub"), prog("oth", "pub")));
  await assertFails(setDoc(doc(as("exp", "exp@x.com"), "progress/exp_pub"), prog("exp", "pub")));
  await assertFails(setDoc(doc(unv(), "progress/unv_pub"), prog("unv", "pub")));
  await assertFails(setDoc(doc(other(), "progress/oth_pub"), prog("oth", "pub")));
  await assertFails(setDoc(doc(stu(), "progress/stu_pub"), prog("stu", "pub", { score: 100 })));
});
test("진도 읽기: 본인(없는 문서 포함)·관리자 · 남의 것과 회원 목록 조회 불가", async () => {
  await assertSucceeds(getDoc(doc(stu(), "progress/stu_pub")));
  await assertSucceeds(getDoc(doc(other(), "progress/oth_pub")));
  await assertFails(getDoc(doc(other(), "progress/stu_pub")));
  await assertSucceeds(getDocs(query(collection(admin(), "progress"), where("courseId", "==", "pub"))));
  await assertFails(getDocs(query(collection(stu(), "progress"), where("courseId", "==", "pub"))));
});
