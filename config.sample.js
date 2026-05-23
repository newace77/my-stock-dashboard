// 🐶 바둑이 주식 대시보드 - 설정 샘플 파일
// 이 파일을 'config.js'로 복사한 후 본인의 설정에 맞게 수정하여 사용하세요.

const CONFIG = {
  // Google Sheets CSV Export URLs (파일 > 웹에 게시 > CSV 선택 후 복사된 URL)
  summaryURL: "YOUR_SUMMARY_SHEET_CSV_URL",
  holdingsURL: "YOUR_HOLDINGS_SHEET_CSV_URL",
  historyURL: "YOUR_HISTORY_SHEET_CSV_URL",

  // 로컬 데이터 스냅샷 (기본값 유지 권장)
  snapshotURL: "data_snapshot.json",

  // Google Apps Script 배포 URL (배포 > 새 배포 > 웹 앱 URL)
  gasURL: "YOUR_GAS_WEB_APP_URL",
  gasApiKey: "YOUR_API_KEY_HERE",

  // Supabase (선택 사항: RSI 데이터 등을 외부 DB에 캐싱할 경우)
  supabaseURL: "",
  supabaseKey: "",
  geminiAPIKey: "", // 구글 제미나이 API 키 입력 (선택사항)
  googleClientID: "", // 구글 OAuth 로그인용 Client ID (선택사항)
};

if (typeof window !== "undefined") {
  window.CONFIG = CONFIG;
}
