import { 
  googleAccessToken, 
  googleTokenExpiry, 
  googleUserEmail, 
  googleTokenClient,
  setGoogleAccessToken,
  setGoogleTokenExpiry,
  setGoogleUserEmail,
  setGoogleTokenClient
} from './state.js';
import { showToast } from './ui.js';

// 구글 로그인 관련 API 선언 및 UI 갱신 함수
export function initGoogleAuth() {
  const container = document.getElementById("google-auth-container");
  if (!container) return;

  // Client ID가 구성되어 있지 않다면 UI 숨김 처리하고 종료
  if (!window.CONFIG || !window.CONFIG.googleClientID) {
    container.style.display = "none";
    return;
  }

  // UI 노출
  container.style.display = "inline-flex";

  // Google GIS Token Client 초기화
  if (
    window.google &&
    window.google.accounts &&
    window.google.accounts.oauth2
  ) {
    setGoogleTokenClient(google.accounts.oauth2.initTokenClient({
      client_id: window.CONFIG.googleClientID,
      scope: "https://www.googleapis.com/auth/cloud-platform email profile",
      callback: handleTokenResponse,
    }));
  } else {
    console.warn("Google Identity Services SDK가 아직 완전히 로드되지 않았습니다. (지연 로딩 중 또는 차단됨)");
  }

  // LocalStorage로부터 세션 복원 시도
  const savedToken = localStorage.getItem("google_access_token");
  const savedExpiry = parseInt(
    localStorage.getItem("google_token_expiry") || "0",
    10,
  );
  const savedEmail = localStorage.getItem("google_user_email");

  if (savedToken && savedExpiry > Date.now()) {
    setGoogleAccessToken(savedToken);
    setGoogleTokenExpiry(savedExpiry);
    setGoogleUserEmail(savedEmail);
    updateGoogleAuthUI();
  } else {
    // 만료된 토큰 청소
    clearGoogleAuthSession();
  }
}

// 토큰 응답 핸들러
export async function handleTokenResponse(response) {
  if (response.error) {
    console.error("구글 OAuth 로그인 실패:", response.error);
    showToast("구글 로그인 실패: " + response.error, "error");
    return;
  }

  setGoogleAccessToken(response.access_token);
  setGoogleTokenExpiry(Date.now() + parseInt(response.expires_in, 10) * 1000);

  localStorage.setItem("google_access_token", googleAccessToken);
  localStorage.setItem("google_token_expiry", googleTokenExpiry);

  // 사용자 이메일 조회를 위해 UserInfo API 호출
  try {
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
        },
      },
    );

    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      setGoogleUserEmail(userInfo.email || "Google User");
      localStorage.setItem("google_user_email", googleUserEmail);
    } else {
      setGoogleUserEmail("구글 사용자");
    }
  } catch (err) {
    console.error("사용자 정보 로드 실패:", err);
    setGoogleUserEmail("구글 사용자");
  }

  updateGoogleAuthUI();
  showToast("구글 로그인이 성공적으로 완료되었습니다! 🐶");
}

// 구글 세션 클리어
export function clearGoogleAuthSession() {
  setGoogleAccessToken(null);
  setGoogleTokenExpiry(0);
  setGoogleUserEmail(null);
  localStorage.removeItem("google_access_token");
  localStorage.removeItem("google_token_expiry");
  localStorage.removeItem("google_user_email");
  updateGoogleAuthUI();
}

// 구글 로그아웃
export function logoutGoogle() {
  if (googleAccessToken) {
    try {
      if (
        window.google &&
        window.google.accounts &&
        window.google.accounts.oauth2
      ) {
        google.accounts.oauth2.revoke(googleAccessToken, () => {
          console.log("구글 액세스 토큰 권한 회수 완료.");
        });
      }
    } catch (e) {
      console.warn("구글 토큰 권한 회수 중 오류 발생 (무시 가능):", e);
    }
  }
  clearGoogleAuthSession();
  showToast("구글 로그아웃이 완료되었습니다.");
}

// 구글 로그인 트리거
export function loginGoogle() {
  if (googleTokenClient) {
    googleTokenClient.requestAccessToken({ prompt: "consent" });
  } else {
    // 런타임에 google 객체 초기화 재시도
    if (
      window.google &&
      window.google.accounts &&
      window.google.accounts.oauth2
    ) {
      setGoogleTokenClient(google.accounts.oauth2.initTokenClient({
        client_id: window.CONFIG.googleClientID,
        scope: "https://www.googleapis.com/auth/cloud-platform email profile",
        callback: handleTokenResponse,
      }));
      googleTokenClient.requestAccessToken({ prompt: "consent" });
    } else {
      showToast(
        "구글 로그인 모듈이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.",
        "error"
      );
    }
  }
}

// UI 상태 업데이트
export function updateGoogleAuthUI() {
  const loginBtn = document.getElementById("google-login-btn");
  const profileDiv = document.getElementById("google-user-profile");
  const emailSpan = document.getElementById("google-user-email");

  const isTokenValid = googleAccessToken && googleTokenExpiry > Date.now();

  if (isTokenValid) {
    if (loginBtn) loginBtn.style.display = "none";
    if (profileDiv) profileDiv.style.display = "inline-flex";
    if (emailSpan) emailSpan.textContent = googleUserEmail;
  } else {
    if (loginBtn) loginBtn.style.display = "inline-flex";
    if (profileDiv) profileDiv.style.display = "none";
    if (emailSpan) emailSpan.textContent = "";
  }
}

window.loginGoogle = loginGoogle;
window.logoutGoogle = logoutGoogle;
