// 강좌 썸네일 = 1차시 유튜브 썸네일 — 서버가 대신 가져다준다(영상 ID 를 방문자에게 보이지 않기 위해).
// 유튜브 썸네일 주소(i.ytimg.com/vi/영상ID/…)에는 영상 ID 가 그대로 들어 있어, 화면에 직접 쓰면
// 비회원도 일부공개 영상을 볼 수 있게 된다 → 서버가 videos(수강생 전용 칸)에서 ID 를 읽고 그림만 돌려준다.
// index.js 의 courseThumb 가 부른다 · 가져오기(fetchImg)는 밖에서 넣어줘 에뮬레이터 검사에서 가짜로 바꿀 수 있다.

export const CID_RE = /^[a-z0-9-]{2,40}$/;   // 강좌 ID 규칙(firestore.rules·admin.js 와 같음)

// 결과 = { image: Buffer, type } (그림) 또는 { fallback: true } (기본 이미지로 넘김)
export async function courseThumb(db, cid, fetchImg) {
  if (!CID_RE.test(cid || "")) return { fallback: true };
  const course = await db.doc(`courses/${cid}`).get();
  if (!course.exists) return { fallback: true };
  const first = await db.collection(`courses/${cid}/lessons`).orderBy("order").limit(1).get();
  if (first.empty) return { fallback: true };
  const vid = (await db.doc(`courses/${cid}/videos/${first.docs[0].id}`).get()).data()?.youtubeId;
  if (!vid || !/^[\w-]{6,20}$/.test(vid)) return { fallback: true };
  // 큰 썸네일(maxres)이 없는 영상도 있어 hq 로 한 번 더 시도
  for (const size of ["maxresdefault", "hqdefault"]) {
    const r = await fetchImg(`https://i.ytimg.com/vi/${vid}/${size}.jpg`).catch(() => null);
    if (r?.ok) return { image: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "image/jpeg" };
  }
  return { fallback: true };
}
