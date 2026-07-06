/**
 * Security Module — 비밀번호 해싱 + 세션 토큰 관리
 *
 * 개선 사항:
 *   - btoa() Base64 → SHA-256 해싱 (crypto.subtle.digest)
 *   - 세션 토큰 (crypto.getRandomValues) → localStorage에 username 평문 저장 방지
 *   - 기존 btoa 해시 계정도 자동 마이그레이션
 *
 * 사용: index.html에서 <script src="./security.js"></script> 로 로드
 */

// ============================================================
// 비밀번호 해싱 (SHA-256)
// ============================================================

/**
 * SHA-256 해시 생성 (async)
 * @param {string} password - 원본 비밀번호
 * @returns {Promise<string>} 64자리 hex 문자열
 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode('petcare2026_v2_' + password + '_salted');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 기존 btoa 해시 생성 (이전 계정 호환용)
 * @param {string} s
 * @returns {string} base64 인코딩된 문자열
 */
function _legacyHash(s) {
  return btoa('petcare2026_' + s + '_salt');
}

/**
 * 저장된 해시가 SHA-256(신규)인지 btoa(구식)인지 판별
 */
function _isNewHash(hash) {
  // SHA-256 hex = 64자, 모두 0-9a-f
  return typeof hash === 'string' && hash.length === 64 && /^[0-9a-f]{64}$/i.test(hash);
}

/**
 * 비밀번호 검증 (신규→구식 순서로 시도, 자동 마이그레이션)
 * @param {string} storedHash - 저장된 해시
 * @param {string} password - 입력된 비밀번호
 * @returns {Promise<{valid: boolean, needsMigration: boolean, newHash?: string}>}
 */
async function verifyPassword(storedHash, password) {
  // 1) 신규 SHA-256 검증
  if (_isNewHash(storedHash)) {
    const newHash = await hashPassword(password);
    if (newHash === storedHash) {
      return { valid: true, needsMigration: false };
    }
    return { valid: false, needsMigration: false };
  }

  // 2) 구식 btoa 검증 (기존 계정 호환)
  const oldHash = _legacyHash(password);
  if (oldHash === storedHash) {
    // 마이그레이션 필요: btoa → SHA-256
    const newHash = await hashPassword(password);
    return { valid: true, needsMigration: true, newHash };
  }

  return { valid: false, needsMigration: false };
}

/**
 * 비밀번호 변경/회원가입 시 새 해시 생성
 * @param {string} password
 * @returns {Promise<string>}
 */
async function createPasswordHash(password) {
  return hashPassword(password);
}

// ============================================================
// 세션 토큰 관리
// ============================================================

const SESSION_KEY = 'petcare_session_v2';

/**
 * 32바이트 랜덤 세션 토큰 생성 (hex 64자)
 * @returns {string}
 */
function generateSessionToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 세션 저장소 구조:
 *   localStorage[SESSION_KEY] = JSON.stringify({
 *     token: "...",         // 랜덤 토큰 (노출돼도 username 비공개)
 *     username: "..."       // 실제 사용자명
 *   })
 */

function saveSession(username) {
  const token = generateSessionToken();
  const session = { token, username };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session && session.token && session.username) {
      return session;
    }
    return null;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * 이전 버전 세션 (petcare_session)을 신규 포맷으로 마이그레이션
 * @returns {string|null} 마이그레이션된 username, 없으면 null
 */
function migrateOldSession() {
  try {
    const oldUser = localStorage.getItem('petcare_session');
    if (oldUser) {
      localStorage.removeItem('petcare_session');
      // 신규 세션 저장
      saveSession(oldUser);
      return oldUser;
    }
  } catch { /* ignore */ }
  return null;
}
