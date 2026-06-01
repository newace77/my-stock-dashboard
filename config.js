// 🐶 바둑이 주식 대시보드 - 설정 파일
const CONFIG = {
    summaryURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=0&single=true&output=csv",
    holdingsURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=58859590&single=true&output=csv",
    historyURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=1345768416&single=true&output=csv",
    snapshotURL: "data_snapshot.json",
    gasURL: "https://script.google.com/macros/s/AKfycbzirAxKTzUj4qXKr4bStAyHk924pqd-i1kUETYsAUNbQC4Rvg4Fl8coysmcd344Cfwk5A/exec",
    gasApiKey: "", // 구글 Apps Script API Key 입력 (선택사항)
    supabaseURL: "", // 사용자 제공 필요
    supabaseKey: "", // 사용자 제공 필요
    geminiAPIKey: "", // 구글 제미나이 API 키 입력 (선택사항)
    googleClientID: "297185948985-0rr0l0pqft3q43mpb1spk98gnid7r2tp.apps.googleusercontent.com" // 구글 OAuth 로그인용 Client ID (선택사항)
};

if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}
