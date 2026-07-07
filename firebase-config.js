/**
 * Firebase Configuration
 * 
 * 🔧 사용 방법:
 *   1. Firebase Console(https://console.firebase.google.com)에서 프로젝트 생성
 *   2. 웹 앱 등록 → Firebase SDK 코드 조각 복사
 *   3. 아래 firebaseConfig 값을 붙여넣기
 */

// ============================================================
// Firebase SDK (CDN)
// ============================================================
// index.html에서 아래 스크립트를 추가하세요:
// <script src="https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/11.0.2/firebase-database-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/11.0.2/firebase-auth-compat.js"></script>

// ============================================================
// 🔑 Firebase Config (직접 입력 필요)
// ============================================================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com", // Realtime DB 사용 시
};

// ============================================================
// 초기화 (Firebase SDK가 로드된 경우에만)
// ============================================================
let app = null;
let db = null;
let rtdb = null;
let auth = null;

try {
  if (typeof firebase !== 'undefined') {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore(app);
    rtdb = firebase.database(app);
    auth = firebase.auth(app);

    // Firestore 설정
    db.settings({
      cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    });
    db.enablePersistence().catch(() => {});

    window.FIREBASE_INITIALIZED = true;
    console.log('✅ Firebase initialized');
  } else {
    console.warn('⚠️ Firebase SDK not loaded — running in local mode');
    window.FIREBASE_INITIALIZED = false;
  }
} catch (e) {
  console.error('❌ Firebase init failed:', e.message);
  window.FIREBASE_INITIALIZED = false;
}

// ============================================================
// Firestore 데이터 구조 (참고용)
// ============================================================
/**
 * collections/
 * 
 * animals/          ← 동물 문서 컬렉션
 *   {animalId}/
 *     name: string
 *     species: string
 *     age: number
 *     birthday: string (YYYY-MM-DD)
 *     weight: number (kg)
 *     lat: number
 *     lng: number
 *     createdAt: timestamp
 * 
 * biodata/          ← 생체 데이터 (실시간)
 *   {animalId}/
 *     heartRate: number
 *     temperature: number
 *     steps: number
 *     calories: number
 *     timestamp: timestamp
 * 
 * calendar/         ← 캘린더 일정
 *   {animalId}/
 *     {date}/       ← "2026-07-06"
 *       steps: number
 *       calories: number
 *       notes: string[]
 *       events: [{ title, date }]
 * 
 * community/        ← 커뮤니티 게시글
 *   {postId}/
 *     author: string
 *     content: string
 *     createdAt: timestamp
 *     likes: number
 * 
 * cams/             ← 홈캠 설정
 *   {animalId}/
 *     streamUrl: string
 *     isActive: boolean
 *     lastPing: timestamp
 */

export { app, db, rtdb, auth, firebaseConfig };
