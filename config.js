// 🐶 바둑이 주식 대시보드 - 설정 파일
const CONFIG = {
    summaryURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=0&single=true&output=csv",
    holdingsURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=58859590&single=true&output=csv",
    historyURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=1345768416&single=true&output=csv",
    snapshotURL: "data_snapshot.json",
    gasURL: "https://script.google.com/macros/s/AKfycbx6iWm7HxdJEUqPOhGoLlQN3--EscDVzHDYcUy0yn1-RU_LkYMQPReTzEkmtoVqkMXM/exec",
    supabaseURL: "", // 사용자 제공 필요
    supabaseKey: ""  // 사용자 제공 필요
};

if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}
