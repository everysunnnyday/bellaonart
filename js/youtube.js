// =========================================================
// 유튜브 플레이어 · 시청 기록 장치
// - LessonTracker: 재생 중 1초마다 위치를 확인해 "실제로 이어서 본 구간"만 모은다 (설계 §4)
//   · 배속이 기준(config/policy.maxRate, 1.5배)을 넘으면 기준 배속으로 되돌리고 안내
//   · 건너뛰기(앞으로 크게 점프)·되감기는 인정하지 않음, 다시 본 구간은 중복 없음
//   · 15초마다 + 일시정지·끝·화면 전환 시 저장
// - probeVideo: 관리자 페이지에서 유튜브 주소만으로 영상 길이·제목 읽기
// =========================================================
import { addSegment, isContinuous, lessonStat } from "./core.js?v=8";

let ytReady = null;
export function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytReady;
}

// 유튜브 주소(여러 형태) 또는 11자리 ID → ID
export function parseYouTubeId(input) {
  const s = String(input || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// 영상 길이(초)·제목 읽기 — 화면 밖에 작은 플레이어를 잠깐 띄웠다가 지운다
export async function probeVideo(videoId) {
  const YT = await loadYT();
  return new Promise((resolve, reject) => {
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;width:320px;height:180px";
    const inner = document.createElement("div");
    holder.appendChild(inner);
    document.body.appendChild(holder);
    let p, finished = false;
    const finish = (val, err) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      try { p?.destroy(); } catch { /* 이미 지워짐 */ }
      holder.remove();
      err ? reject(err) : resolve(val);
    };
    const read = () => {
      const d = p.getDuration();
      if (d > 0) finish({ durationSec: Math.floor(d * 10) / 10, title: p.getVideoData()?.title || "" });
      return d > 0;
    };
    const timer = setTimeout(() => finish(null, new Error("영상 정보를 읽지 못했습니다(시간 초과).")), 20000);
    p = new YT.Player(inner, {
      videoId, playerVars: { mute: 1, playsinline: 1 },
      events: {
        onReady: () => { if (!read()) { p.mute(); p.playVideo(); } },
        onStateChange: (e) => { if (e.data === YT.PlayerState.PLAYING) read(); },
        onError: (e) => finish(null, new Error(`영상을 불러올 수 없습니다(코드 ${e.data}). 일부공개이며 '퍼가기 허용'인지 확인해 주세요.`)),
      },
    });
  });
}

const SAVE_EVERY = 15000;   // 재생 중 저장 간격(ms)

export class LessonTracker {
  // el: 플레이어를 넣을 빈 div · lesson: {id, youtubeId, durationSec} · entry: 저장된 진도(없으면 null)
  // onTick(stat): 화면 갱신 · onSave({seg,lastPos,done}): 저장 · onRateLimited(): 배속 제한 안내
  constructor({ el, lesson, entry, policy, onTick, onSave, onRateLimited }) {
    Object.assign(this, { el, lesson, policy, onTick, onSave, onRateLimited });
    this.seg = entry?.seg ? entry.seg.slice() : [];
    this.done = !!entry?.done;
    this.lastPos = entry?.lastPos || 0;
    this.dirty = false;
    this.timer = null;
    this.lastSave = performance.now();
  }

  stat() { return lessonStat({ seg: this.seg, done: this.done }, this.lesson, this.policy); }

  async start() {
    const YT = await loadYT();
    this.YT = YT;
    const dur = this.lesson.durationSec || 0;
    // 이어보기: 끝난 차시이거나 거의 끝에서 멈췄으면 처음부터
    const from = !this.done && this.lastPos > 3 && this.lastPos < dur - 5 ? Math.floor(this.lastPos) : 0;
    await new Promise((resolve) => {
      this.player = new YT.Player(this.el, {
        videoId: this.lesson.youtubeId,
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1, start: from },
        events: {
          onReady: () => resolve(),
          onStateChange: (e) => this.onState(e.data),
          onPlaybackRateChange: (e) => this.onRate(e.data),
        },
      });
    });
    this.onVis = () => { if (document.visibilityState === "hidden") this.save(); };
    document.addEventListener("visibilitychange", this.onVis);
    window.addEventListener("pagehide", this.onVis);
  }

  onState(s) {
    const S = this.YT.PlayerState;
    if (s === S.PLAYING) {
      this.prevT = this.player.getCurrentTime();
      this.prevWall = performance.now();
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 1000);
    } else if (s === S.PAUSED || s === S.ENDED || s === S.BUFFERING) {
      if (this.timer) { this.tick(); clearInterval(this.timer); this.timer = null; }
      if (s !== S.BUFFERING) this.save();
    }
  }

  onRate(rate) {
    if (rate > this.policy.maxRate + 1e-6) {
      this.player.setPlaybackRate(this.policy.maxRate);
      this.onRateLimited?.();
    }
  }

  tick() {
    if (!this.player?.getCurrentTime) return;
    const t = this.player.getCurrentTime();
    const now = performance.now();
    const wall = (now - this.prevWall) / 1000;
    const rate = this.player.getPlaybackRate();
    if (rate <= this.policy.maxRate + 1e-6 && isContinuous(this.prevT, t, wall, this.policy.maxRate)) {
      this.seg = addSegment(this.seg, this.prevT, t);
      this.dirty = true;
    }
    this.prevT = t; this.prevWall = now;
    if (Math.abs(t - this.lastPos) >= 1) { this.lastPos = t; this.dirty = true; }
    const st = this.stat();
    if (st.done && !this.done) { this.done = true; this.dirty = true; this.save(); }   // 완료 순간 바로 저장
    this.onTick?.(st);
    if (now - this.lastSave > SAVE_EVERY) this.save();
  }

  async save() {
    if (!this.dirty) return;
    this.dirty = false;
    this.lastSave = performance.now();
    try { await this.onSave({ seg: this.seg, lastPos: Math.floor(this.lastPos), done: this.done }); }
    catch (e) { this.dirty = true; console.warn("진도 저장 실패 — 다음 저장 때 다시 시도", e); }
  }

  async destroy() {
    clearInterval(this.timer); this.timer = null;
    document.removeEventListener("visibilitychange", this.onVis);
    window.removeEventListener("pagehide", this.onVis);
    await this.save();
    try { this.player?.destroy(); } catch { /* 무시 */ }
  }
}
