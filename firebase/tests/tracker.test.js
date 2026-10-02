// 시청 기록 장치 검사 (js/youtube.js LessonTracker) — 가짜 플레이어로 재생 상황을 흉내 낸다
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { LessonTracker } from "../../js/youtube.js";
import { DEFAULT_POLICY as P } from "../../js/core.js";

// 브라우저 대신 쓰는 최소한의 가짜 환경
globalThis.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };
globalThis.window = { addEventListener() {}, removeEventListener() {} };
let clock = 0;
globalThis.performance = { now: () => clock };
const ST = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };

function make(dur = 100, entry = null) {
  const player = { t: 0, rate: 1, getCurrentTime() { return this.t; }, getPlaybackRate() { return this.rate; },
    setPlaybackRate(r) { this.rate = r; }, destroy() {} };
  const saves = [];
  let limited = 0;
  const tr = new LessonTracker({
    el: null, lesson: { id: "l1", youtubeId: "x", durationSec: dur }, entry, policy: P,
    onTick: () => {}, onSave: async (d) => { saves.push(JSON.parse(JSON.stringify(d))); },
    onRateLimited: () => { limited++; },
  });
  tr.YT = { PlayerState: ST };
  tr.player = player;
  globalThis.setInterval = () => 1; globalThis.clearInterval = () => {};   // 1초 타이머는 직접 tick() 호출로 대신
  return { tr, player, saves, limited: () => limited };
}
// sec 초 동안 rate 배속으로 재생 (1초마다 tick)
function play(tr, p, sec) {
  for (let i = 0; i < sec; i++) { clock += 1000; p.t = Math.min(p.t + p.rate, tr.lesson.durationSec); tr.tick(); }
}

beforeEach(() => { clock = 0; });

test("정상 재생 1배속 30초 → 30초 인정", () => {
  const { tr, player } = make();
  tr.onState(ST.PLAYING);
  play(tr, player, 30);
  assert.equal(tr.stat().watched, 30);
});

test("1.5배속은 인정 (20초에 30초분)", () => {
  const { tr, player } = make();
  player.rate = 1.5;
  tr.onState(ST.PLAYING);
  play(tr, player, 20);
  assert.equal(tr.stat().watched, 30);
});

test("2배속으로 바꾸면 1.5배로 되돌리고 안내 · 2배속 상태의 재생은 인정 안 함", () => {
  const { tr, player, limited } = make();
  tr.onState(ST.PLAYING);
  tr.onRate(2);
  assert.equal(player.rate, 1.5);
  assert.equal(limited(), 1);
  player.rate = 2;                 // 되돌리기 전 순간에 흐른 재생이 있다고 가정
  play(tr, player, 5);
  assert.equal(tr.stat().watched, 0);
});

test("건너뛰기(10초→80초)는 인정 안 함, 이후 이어 본 부분만 인정", () => {
  const { tr, player } = make();
  tr.onState(ST.PLAYING);
  play(tr, player, 10);
  player.t = 80; clock += 1000; tr.tick();   // 재생 중 앞으로 점프
  play(tr, player, 5);
  assert.equal(tr.stat().watched, 15);
});

test("되감아 다시 본 구간은 중복 없음", () => {
  const { tr, player } = make();
  tr.onState(ST.PLAYING);
  play(tr, player, 20);
  player.t = 5; tr.onState(ST.PLAYING);      // 되감기 후 재생 시작(새 기준점)
  play(tr, player, 10);
  assert.equal(tr.stat().watched, 20);
});

test("일시정지 중 위치를 옮긴 뒤 재생해도 그 사이는 인정 안 함", () => {
  const { tr, player } = make();
  tr.onState(ST.PLAYING);
  play(tr, player, 10);
  tr.onState(ST.PAUSED);
  clock += 60000; player.t = 70;               // 멈춘 동안 뒤쪽으로 이동
  tr.onState(ST.PLAYING);
  play(tr, player, 5);
  assert.equal(tr.stat().watched, 15);
});

test("98% 넘는 순간 완료 + 바로 저장, 끝까지 보면 100%", async () => {
  const { tr, player, saves } = make(100);
  tr.onState(ST.PLAYING);
  play(tr, player, 97);
  assert.equal(tr.stat().done, false);
  play(tr, player, 1);
  assert.equal(tr.stat().done, true);
  await Promise.resolve();
  assert.ok(saves.some((s) => s.done === true), "완료 순간 저장되어야 함");
  play(tr, player, 5);
  assert.equal(tr.stat().watched, 100);
});

test("저장: 일시정지 때 저장, 이어보기 위치 기록", async () => {
  const { tr, player, saves } = make();
  tr.onState(ST.PLAYING);
  play(tr, player, 12);
  tr.onState(ST.PAUSED);
  await Promise.resolve();
  assert.equal(saves.at(-1).lastPos, 12);
  assert.deepEqual(saves.at(-1).seg, [0, 12]);
});

test("15초마다 자동 저장", async () => {
  const { tr, player, saves } = make();
  tr.onState(ST.PLAYING);
  play(tr, player, 14);
  assert.equal(saves.length, 0);
  play(tr, player, 2);
  await Promise.resolve();
  assert.equal(saves.length, 1);
});

test("저장된 진도에서 이어서 쌓임", () => {
  const { tr, player } = make(100, { seg: [0, 40], lastPos: 40, done: false });
  player.t = 40;
  tr.onState(ST.PLAYING);
  play(tr, player, 10);
  assert.equal(tr.stat().watched, 50);
});
