// =========================================================
// Firebase 연결 (모든 클래스·관리자 페이지가 여기서만 연결한다)
// - 내 PC(localhost)에서 열면: 에뮬레이터(내 PC 안의 가짜 서버)에 연결 → 실제 데이터와 절대 섞이지 않음
// - www.bellaonart.com 에서 열면: 아래 PROD_CONFIG 의 실제 Firebase 프로젝트에 연결
//   (이 설정값은 비밀번호가 아니라 공개돼도 되는 값이다. 보안은 firebase/firestore.rules 가 담당한다.)
// =========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth, connectAuthEmulator, GoogleAuthProvider, signInWithPopup, signInWithCredential,
  onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, updateProfile,
  EmailAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, updatePassword, deleteUser,
  applyActionCode, checkActionCode, verifyPasswordResetCode, confirmPasswordReset,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  getFunctions, connectFunctionsEmulator, httpsCallable,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-functions.js";

// 페이지들은 Firestore 함수를 이 파일에서 가져다 쓴다(버전 주소를 한 곳에만 두기 위해)
export {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy,
  writeBatch, serverTimestamp, Timestamp,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
export {
  GoogleAuthProvider, signInWithPopup, signInWithCredential, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, updateProfile,
  EmailAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, updatePassword, deleteUser,
  applyActionCode, checkActionCode, verifyPasswordResetCode, confirmPasswordReset,
};

// 실제 Firebase 프로젝트 bellaon-class (써니님 계정, 웹 앱 bellaon-web) — 2026-10-03 콘솔 원본과 대조 완료
const PROD_CONFIG = {
  apiKey: "AIzaSyCXC9G5vi88dh_-PYLezuZkdehRngBFDEQ",
  authDomain: "bellaon-class.firebaseapp.com",
  projectId: "bellaon-class",
  storageBucket: "bellaon-class.firebasestorage.app",
  messagingSenderId: "387422604965",
  appId: "1:387422604965:web:ab48be698fdee3aac7c74c",
};

export const IS_EMU = ["localhost", "127.0.0.1"].includes(location.hostname);

// 강좌 썸네일 그림 주소 = 서버 함수 courseThumbImg (1차시 유튜브 썸네일을 영상 ID 를 숨긴 채 가져다줌)
const FN_BASE = IS_EMU ? "http://127.0.0.1:5099/demo-bellaon/asia-northeast3" : "https://asia-northeast3-bellaon-class.cloudfunctions.net";
export const courseThumbUrl = (cid) => `${FN_BASE}/courseThumbImg?c=${encodeURIComponent(cid)}`;
export const CONFIGURED = IS_EMU || !!PROD_CONFIG.projectId;

export const app = initializeApp(IS_EMU   // js/files.js(파일 창고)가 같은 앱을 쓴다
  ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-bellaon", storageBucket: "demo-bellaon.appspot.com" }
  : PROD_CONFIG);

export const auth = getAuth(app);
auth.languageCode = "ko";   // 인증·비밀번호 재설정 메일을 한국어로
export const db = getFirestore(app);
// 서버 함수(수강 코드 확인) — 서울 지역(firebase/functions/index.js 와 같아야 함)
const fns = getFunctions(app, "asia-northeast3");
export const redeemCode = (code) => httpsCallable(fns, "redeemCode")({ code }).then((r) => r.data);

if (IS_EMU) {
  connectAuthEmulator(auth, "http://127.0.0.1:9299", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8285);
  connectFunctionsEmulator(fns, "127.0.0.1", 5099);
}
