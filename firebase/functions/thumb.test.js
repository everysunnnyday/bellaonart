// 강좌 썸네일 검사 (thumb.js) — 에뮬레이터 Firestore + 가짜 유튜브(실제 인터넷 안 씀)
// 실행: firebase 폴더에서 npm test · ※ 배포 제외(firebase.json functions.ignore)
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { courseThumb } from "./thumb.js";

let db;
// 가짜 유튜브: 있는 그림 목록에 있으면 성공, 없으면 404 · 부른 주소를 기록
const fakeYt = (have) => {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const ok = have.some((h) => url.endsWith(h));
    return { ok, headers: new Map([["content-type", "image/jpeg"]]), arrayBuffer: async () => new TextEncoder().encode("JPG:" + url).buffer };
  };
  fn.calls = calls;
  return fn;
};

before(() => { initializeApp({ projectId: "demo-bellaon" }); db = getFirestore(); });
beforeEach(async () => {
  await db.recursiveDelete(db.collection("courses"));
  const b = db.batch();
  b.set(db.doc("courses/pub"), { title: "공개", published: true });
  // 순서 2 를 먼저 넣어도 순서 1(첫 차시)을 골라야 함
  b.set(db.doc("courses/pub/lessons/z2"), { title: "2강", durationSec: 10, order: 2 });
  b.set(db.doc("courses/pub/videos/z2"), { youtubeId: "SECONDvideo" });
  b.set(db.doc("courses/pub/lessons/a1"), { title: "1강", durationSec: 10, order: 1 });
  b.set(db.doc("courses/pub/videos/a1"), { youtubeId: "FIRSTvideo1" });
  b.set(db.doc("courses/empty"), { title: "차시 없음", published: true });
  b.set(db.doc("courses/novid"), { title: "영상 주소 없음", published: true });
  b.set(db.doc("courses/novid/lessons/x"), { title: "1강", durationSec: 10, order: 1 });
  await b.commit();
});

test("1차시(순서 1) 영상의 큰 썸네일을 가져온다 · 2차시는 쓰지 않음", async () => {
  const yt = fakeYt(["FIRSTvideo1/maxresdefault.jpg"]);
  const r = await courseThumb(db, "pub", yt);
  assert.ok(r.image);
  assert.equal(r.type, "image/jpeg");
  assert.deepEqual(yt.calls, ["https://i.ytimg.com/vi/FIRSTvideo1/maxresdefault.jpg"]);
});

test("큰 썸네일이 없는 영상이면 보통 크기(hq)로", async () => {
  const yt = fakeYt(["FIRSTvideo1/hqdefault.jpg"]);
  const r = await courseThumb(db, "pub", yt);
  assert.ok(r.image);
  assert.equal(yt.calls.length, 2);
  assert.ok(yt.calls[1].endsWith("/FIRSTvideo1/hqdefault.jpg"));
});

test("기본 그림으로: 없는 강좌 · 차시 없음 · 영상 주소 없음 · 유튜브에 그림 없음 · 이상한 강좌 ID", async () => {
  const none = fakeYt([]);
  assert.deepEqual(await courseThumb(db, "nope", none), { fallback: true });
  assert.deepEqual(await courseThumb(db, "empty", none), { fallback: true });
  assert.deepEqual(await courseThumb(db, "novid", none), { fallback: true });
  assert.deepEqual(await courseThumb(db, "pub", none), { fallback: true });
  assert.deepEqual(await courseThumb(db, "../config/admins", none), { fallback: true });
  assert.deepEqual(await courseThumb(db, "", none), { fallback: true });
});

test("돌려주는 것은 그림뿐 — 결과에 영상 ID 가 들어가지 않음", async () => {
  const r = await courseThumb(db, "pub", fakeYt(["FIRSTvideo1/maxresdefault.jpg"]));
  assert.deepEqual(Object.keys(r).sort(), ["image", "type"]);
  assert.ok(!r.type.includes("FIRSTvideo1"));
});
