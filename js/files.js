// =========================================================
// 파일 창고(Firebase Storage) — 도안 PDF · 강좌 썸네일 (2026-10-04)
// - 관리자·강좌 상세/강의실·마이페이지만 불러온다(메인 등 공개 페이지가 이 부품을 받지 않게 firebase.js 와 분리)
// - 권한은 firebase/storage.rules: 도안 = 관리자 + 유효 수강권 회원만 받기 · 썸네일 = 누구나 보기 · 올리기는 관리자만
// - 강좌 문서에는 파일 정보만: patterns = [{ id, name, size, updatedAt }] · thumb = 그림 주소 · thumbPath = 창고 안 위치
// =========================================================
import { app, IS_EMU } from "./firebase.js?v=9";
import { toast, esc, dialog } from "./common.js?v=9";
import { t } from "./i18n.js?v=9";
import {
  getStorage, connectStorageEmulator, ref, uploadBytes, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";

const storage = getStorage(app);
if (IS_EMU) connectStorageEmulator(storage, "127.0.0.1", 9199);

// 크기 기준 — storage.rules 의 제한과 같게(화면에서 먼저 알려 주기 위함)
export const PATTERN_MAX = 20 * 1024 * 1024;   // 도안 PDF 20MB
export const THUMB_MAX_W = 1280;                // 썸네일 가로 최대(px) — 화면에서 쓰는 크기의 2배 여유
const THUMB_MAX = 2 * 1024 * 1024;

export const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
// ---------- 도안 (강좌마다 여러 개 · 파일 이름으로 구분 — 2026-10-04 써니님) ----------
// 창고 위치 = courses/강좌ID/patterns/번호.pdf · 강좌 문서 patterns = [{ id: 번호, name: 원래 파일 이름, size, updatedAt }]
// 같은 이름을 다시 올리면 교체(관리자 화면이 옛 파일을 지움) · 받는 사람 컴퓨터엔 원래 이름으로 저장(브라우저에서 열리지 않음)
const patternRef = (cid, id) => ref(storage, `courses/${cid}/patterns/${id}.pdf`);
export const patternsOf = (course) => (Array.isArray(course?.patterns) ? course.patterns : []);
let lastId = 0;
const newId = () => (lastId = Math.max(Date.now(), lastId + 1));   // 한꺼번에 여러 개 올려도 번호가 겹치지 않게

export async function uploadPattern(cid, file) {
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) throw new Error(`PDF 파일만 올릴 수 있습니다. (${file.name})`);
  if (file.size > PATTERN_MAX) throw new Error(`PDF 는 ${fmtSize(PATTERN_MAX)} 까지 올릴 수 있습니다. (${file.name} ${fmtSize(file.size)})`);
  const id = String(newId());
  await uploadBytes(patternRef(cid, id), file, {
    contentType: "application/pdf",
    contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
  });
  return { id, name: file.name, size: file.size };
}
export const deletePattern = (cid, id) => deleteObject(patternRef(cid, id)).catch((e) => { if (e.code !== "storage/object-not-found") throw e; });
// 내려받기 — 창고가 수강권을 확인한 뒤 주소를 준다(없으면 storage/unauthorized)
export async function downloadPattern(cid, id) {
  location.href = await getDownloadURL(patternRef(cid, id));
}
// 수강생 [도안 내려받기] 버튼 묶음 — 강의실 옆칸·마이페이지가 같이 쓴다(파일마다 버튼 하나, 파일 이름 표시)
export const patternButtonsHtml = (cid, course, cls = "btn") => patternsOf(course).map((p) =>
  `<button type="button" class="${cls}" data-pat-c="${esc(cid)}" data-pat-id="${esc(p.id)}" title="도안 내려받기: ${esc(p.name)}">↓ ${esc(p.name.replace(/\.pdf$/i, ""))}</button>`).join("");
// 강좌 상세 "도안" 줄의 [도안 내려받기] → 팝업에 도안 목록 · 파일마다 [내려받기] (2026-10-04 써니님) — 공용 확인창(common.js dialog) 사용
export function openPatternDialog(cid, course) {
  const list = patternsOf(course);
  dialog({
    title: t("도안 내려받기", "cd.patDl"), ok: t("닫기", "dlg.close"), cancel: "",
    body: `<ul class="pat-pop">${list.map((p) => `<li><span class="nm">${esc(p.name)} <small>${fmtSize(p.size)}</small></span>
      <button type="button" class="btn sage sm" data-pat-c="${esc(cid)}" data-pat-id="${esc(p.id)}">${t("내려받기", "cd.dlOne")}</button></li>`).join("")}</ul>`,
  });
  bindPatternButtons([...document.querySelectorAll(".dlg-wrap")].pop());   // 방금 열린 팝업 안의 버튼
}
export const bindPatternButtons = (root) => root.querySelectorAll("[data-pat-id]").forEach((b) => {
  b.onclick = () => patternDownload(b, b.dataset.patC, b.dataset.patId);
});
async function patternDownload(btn, cid, id) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "준비 중…";
  try { await downloadPattern(cid, id); }
  catch (e) {
    console.error(e);
    toast(e.code === "storage/unauthorized" ? "수강 기간이 아니어서 도안을 받을 수 없습니다." : "도안을 내려받지 못했습니다. 잠시 후 다시 시도해 주세요.", 4500);
  } finally {
    setTimeout(() => { btn.disabled = false; btn.textContent = label; }, 1500);
  }
}

// ---------- 썸네일 ----------
// 고른 그림을 브라우저에서 WebP 로 바꾸고 가로 1280px 이하로 줄여 올린다(빨리 뜨게) · 이름에 올린 시각 → 옛 그림이 남지 않음
export async function toWebp(file, maxW = THUMB_MAX_W, quality = 0.85) {
  if (!/^image\//.test(file.type)) throw new Error("그림 파일(JPG·PNG·WebP)만 올릴 수 있습니다.");
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/webp", quality));
  if (!blob || blob.type !== "image/webp") throw new Error("이 브라우저는 WebP 변환을 못 합니다. 크롬에서 올려 주세요.");
  if (blob.size > THUMB_MAX) throw new Error("그림이 너무 큽니다. 더 작은 그림을 골라 주세요.");
  return { blob, width: c.width, height: c.height };
}
export async function uploadThumb(cid, file) {
  const { blob, width, height } = await toWebp(file);
  const path = `courses/${cid}/thumb-${Date.now()}.webp`;
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: "image/webp", cacheControl: "public, max-age=31536000" });
  return { url: await getDownloadURL(r), path, width, height, size: blob.size };
}
// 창고에 올렸던 썸네일만 지운다(직접 넣었던 주소·없는 파일은 무시)
export async function deleteThumb(path) {
  if (!path || !/^courses\/[^/]+\/thumb-\d+\.webp$/.test(path)) return;
  await deleteObject(ref(storage, path)).catch((e) => { if (e.code !== "storage/object-not-found") throw e; });
}
