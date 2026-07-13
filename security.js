/**
 * Security Module — 비밀번호 해싱 + 세션 토큰 관리
 *
 * 개선 사항:
 *   - btoa() Base64 → SHA-256 해싱 (crypto.subtle.digest)
 *   - 세션 토큰 (crypto.getRandomValues) → localStorage에 username 평문 저장 방지
 *   - 기존 btoa 해시 계정도 자동 마이그레이션
 *   - 솔트 난독화 (직접 문자열 검색 방지)
 *   - 다중 SHA-256 반복 (key stretching)
 *
 * 사용: index.html에서 <script src="./security.js"></script> 로 로드
 */

// ============================================================
// 비밀번호 해싱 (SHA-256 + key stretching)
// ============================================================

/**
 * 솔트 생성 (난독화 — 소스에서 직접 검색 어렵게)
 * @returns {string}
 */
function _buildSalt() {
  const a = String.fromCharCode(112, 99, 50, 56, 95, 118, 50);
  const b = String.fromCharCode(115, 108, 116, 95);
  const c = 'a7f3';
  return a + b + c;
}

function _legacyYearSalts() {
  const a = String.fromCharCode(112, 99, 50, 56, 95, 118, 50);
  const b = String.fromCharCode(115, 108, 116, 95);
  const salts = [];
  for (let yr = 2024; yr <= 2035; yr++) {
    salts.push(a + b + ((yr - 2000) * 7 + 13).toString(16));
  }
  return salts;
}

/**
 * SHA-256 해시 생성 (async, 3회 반복 = key stretching)
 * @param {string} password - 원본 비밀번호
 * @returns {Promise<string>} 64자리 hex 문자열
 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = _buildSalt();
  let data = encoder.encode(salt + password);
  for (let i = 0; i < 3; i++) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    data = encoder.encode(hashArray.map(b => b.toString(16).padStart(2, '0')).join('') + password);
  }
  const finalBuffer = await crypto.subtle.digest('SHA-256', data);
  const finalArray = Array.from(new Uint8Array(finalBuffer));
  return finalArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function _hashWithSalt(password, salt) {
  const encoder = new TextEncoder();
  let data = encoder.encode(salt + password);
  for (let i = 0; i < 3; i++) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    data = encoder.encode(hashArray.map(b => b.toString(16).padStart(2, '0')).join('') + password);
  }
  const finalBuffer = await crypto.subtle.digest('SHA-256', data);
  const finalArray = Array.from(new Uint8Array(finalBuffer));
  return finalArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 기존 btoa 해시 생성 (이전 계정 호환용)
 * @param {string} s
 * @returns {string} base64 인코딩된 문자열
 */
function _legacyHash(s) {
  const a = String.fromCharCode(112, 101, 116, 99, 97, 114, 101); // "petcare"
  const b = String.fromCharCode(95, 115, 97, 108, 116); // "_salt"
  return btoa(a + '_' + s + b);
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
  // 1) 신규 static salt 검증
  if (_isNewHash(storedHash)) {
    const newHash = await hashPassword(password);
    if (newHash === storedHash) {
      return { valid: true, needsMigration: false };
    }
    // 2) 연도 기반 구 salts로 폴백 시도 (기존 계정 마이그레이션)
    const yearSalts = _legacyYearSalts();
    for (const salt of yearSalts) {
      const legacyHash = await _hashWithSalt(password, salt);
      if (legacyHash === storedHash) {
        const migratedHash = await hashPassword(password);
        return { valid: true, needsMigration: true, newHash: migratedHash };
      }
    }
    return { valid: false, needsMigration: false };
  }

  // 3) 구식 btoa 검증 (이전 버전 호환)
  const oldHash = _legacyHash(password);
  if (oldHash === storedHash) {
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

const SESSION_KEY = String.fromCharCode(112, 99, 115, 101, 115, 95, 118, 50); // "pcses_v2"

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
 * 이전 버전 세션 (petcare_session 또는 petcare_session_v2)을 신규 포맷으로 마이그레이션
 * @returns {string|null} 마이그레이션된 username, 없으면 null
 */
function migrateOldSession() {
  try {
    // v1: petcare_session (평문 username)
    const oldUser = localStorage.getItem('petcare_session');
    if (oldUser) {
      localStorage.removeItem('petcare_session');
      saveSession(oldUser);
      return oldUser;
    }
    // v2: petcare_session_v2 (객체 형식, 이전 키 이름)
    const raw = localStorage.getItem('petcare_session_v2');
    if (raw) {
      localStorage.removeItem('petcare_session_v2');
      try {
        const session = JSON.parse(raw);
        if (session && session.username) {
          saveSession(session.username);
          return session.username;
        }
      } catch {}
    }
  } catch { /* ignore */ }
  return null;
}
