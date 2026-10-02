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
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

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
export const CONFIGURED = IS_EMU || !!PROD_CONFIG.projectId;

const app = initializeApp(IS_EMU
  ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-bellaon" }
  : PROD_CONFIG);

export const auth = getAuth(app);
auth.languageCode = "ko";   // 인증·비밀번호 재설정 메일을 한국어로
export const db = getFirestore(app);

if (IS_EMU) {
  connectAuthEmulator(auth, "http://127.0.0.1:9299", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8285);
}
