# 🐶 바둑이 주식 대시보드

개인 주식 포트폴리오를 **Google Sheets**와 연동하여 실시간으로 시각화하는 웹 대시보드입니다.

## 📸 주요 화면 구성

| 영역 | 설명 |
|------|------|
| 상단 요약 카드 | 총 평가액, 투자액, 수익액, 수익률, 배당금, 달러 비중 |
| 시장 지수 카드 | S&P 500, NASDAQ, KOSPI, USD/KRW 환율, 금, 비트코인 실시간 현황 |
| 포트폴리오 요약 | 계좌별 투자금/평가금 막대 차트 + 상세 테이블 |
| 자산 추이 | 날짜별 총 평가금 & 총 투자금 추이 라인 차트 |
| 성과 분석 버블 차트 | X축(일일 변동률) × Y축(총 수익률) × 버블 크기(평가금) |
| 보유 종목 테이블 | 비중, 수익률, 수익액, 평가금액, 일일 변동률 — 컬럼별 정렬 가능 |
| 매매 기록 입력 | 계좌/종류/통화/날짜/종목/수량/단가 → Google Sheets에 자동 기록 |

---

## 🗂️ 프로젝트 구조

```
my-stock-dashboard/
├── index.html          # 메인 HTML (UI 레이아웃)
├── style.css           # 스타일시트 (반응형 포함)
├── script.js           # 프론트엔드 로직 (데이터 로드, 차트, 폼)
├── GAS.js              # Google Apps Script 백엔드 코드
├── data_snapshot.json  # 오프라인 폴백용 로컬 스냅샷 데이터
├── package.json        # npm 스크립트 (로컬 개발 서버)
└── README.md           # 이 파일
```

---

## 🛠️ 기술 스택

| 분류 | 기술 |
|------|------|
| 프론트엔드 | HTML5, Vanilla CSS, Vanilla JavaScript (ES2020+) |
| 차트 라이브러리 | [Chart.js](https://www.chartjs.org/) (CDN) |
| CSV 파싱 | [PapaParse](https://www.papaparse.com/) (CDN) |
| 데이터 소스 | Google Sheets (CSV 공개 게시) |
| 백엔드 | Google Apps Script (Webhook 역할) |
| 배포 | Netlify / 로컬 serve |
| 폰트 | Noto Sans KR (Google Fonts) |

---

## ⚙️ 데이터 아키텍처

```
[Google Sheets]
    ├─ Summary 시트  ──┐
    ├─ Holdings 시트 ──┤──(CSV 공개 게시)──→ [CORS Proxy] ──→ [script.js]
    └─ History 시트  ──┘                                         │
                                                                 ↓
[data_snapshot.json] ────(폴백/초기 로딩)────────────────→ [UI 렌더링]
                                                                 ↑
[Google Apps Script] ←──(POST 요청)──── [매매 기록 폼] ─────────┘
    └─ 시장 지수 갱신(GOOGLEFINANCE)
    └─ record 시트에 행 추가
```

### 데이터 로딩 우선순위
1. **로컬 스냅샷** (`data_snapshot.json`) — 즉시 표시 (가장 빠름)  
2. **Google Sheets CSV** — 직접 요청 → 실패 시 CORS 프록시 #1 → 프록시 #2 순으로 폴백

---

## 🚀 시작하기

### 1. Google Sheets 설정

1. Google Sheets를 열고 **파일 → 공유 → 웹에 게시** 클릭
2. 아래 세 개의 시트를 각각 **CSV 형식으로 게시**하여 URL 복사

| 시트 이름 | 역할 |
|-----------|------|
| `Summary` | 계좌별 요약 + 시장 지수 데이터 |
| `Holdings` | 보유 종목 상세 정보 |
| `History` | 날짜별 자산 추이 |

### 2. Google Apps Script 설정 (매매 기록 기능)

1. Google Sheets에서 **확장 프로그램 → Apps Script** 클릭
2. `GAS.js` 내용을 붙여넣기
3. `accountMap`의 각 계좌에 해당하는 스프레드시트 ID 입력
4. **배포 → 새 배포** (유형: 웹 앱, 액세스: 모든 사용자)
5. 생성된 URL 복사

### 3. script.js CONFIG 설정

`script.js` 상단의 `CONFIG` 객체를 수정합니다:

```javascript
const CONFIG = {
    summaryURL: "여기에_Summary_CSV_URL",
    holdingsURL: "여기에_Holdings_CSV_URL",
    historyURL: "여기에_History_CSV_URL",
    snapshotURL: "data_snapshot.json",
    gasURL: "여기에_GAS_배포_URL"
};
```

### 4. 로컬 실행

```bash
# npm으로 실행 (serve 자동 설치)
npm start

# 또는 Python으로 실행
npm run dev
# → http://localhost:8000 접속
```

---

## 📊 Google Sheets 데이터 형식

### Summary 시트 (계좌 요약)

| 행/열 | 내용 |
|--------|------|
| 9행 B열 | 총 평가액 |
| 9행 C열 | 총 투자액 |
| 9행 D열 | 총 수익액 |
| 9행 E열 | 총 수익률 |
| 9행 L열 | 총 배당금 |
| 10행 C열 | 달러 자산 비중 |
| 14~19행 P열 | 시장 지수 현재가 (S&P500, NASDAQ, KOSPI, USD/KRW, 금, BTC) |
| 14~19행 Q열 | 전일 대비 변화량 |
| 14~19행 R열 | 전일 대비 변화율 |

### Holdings 시트 (보유 종목)

| 열 번호 | 내용 |
|---------|------|
| 0 (A) | 종목명 |
| 7 (H) | 수익률 (%) |
| 8 (I) | 평가금액 (KRW) |
| 9 (J) | 포트폴리오 비중 (%) |
| 10 (K) | 일일 변동률 (%) |
| 14 (O) | 수익액 (KRW) |

### History 시트 (자산 추이)

| 열 번호 | 내용 |
|---------|------|
| 0 (A) | 날짜 |
| 1 (B) | 총 평가금액 |
| 2 (C) | 총 투자금액 |

---

## 🔧 주요 기능 상세

### 자동 데이터 갱신
- 페이지 로드 시 즉시 실행
- **10분마다 자동 새로고침**
- 🐾 버튼 클릭으로 수동 새로고침 가능

### CORS 폴백 전략
직접 요청 실패 시 두 개의 프록시를 순차적으로 시도합니다:

```
1. 직접 요청 (Google Sheets CSV)
2. allorigins.win 프록시
3. corsproxy.io 프록시
```

### 매매 기록 입력
거래 종류에 따라 입력 필드가 동적으로 변경됩니다:

| 거래 종류 | 종목명 입력 | 단가 입력 |
|-----------|------------|----------|
| 매수 / 매도 | ✅ | ✅ |
| 배당금 | ✅ | ❌ |
| 현금입금 / 현금출금 | ❌ | ❌ |

---

## 🌐 배포

[Netlify](https://www.netlify.com/) 등 정적 호스팅 서비스에 폴더 전체를 업로드하면 됩니다.

- 빌드 과정 불필요 (순수 HTML/CSS/JS)
- 공개 URL: https://ajm-stock.netlify.app (예시)

---

## ⚠️ 주의사항

- Google Sheets CSV URL은 시트가 **"웹에 게시"** 상태여야 합니다
- GAS 배포 URL은 **액세스 권한을 "모든 사용자"** 로 설정해야 합니다
- `data_snapshot.json`은 Google Sheets 연결 실패 시 표시되는 임시 데이터입니다. 주기적으로 최신 데이터로 업데이트하는 것을 권장합니다
- CORS 프록시는 외부 서비스이므로 간헐적으로 실패할 수 있습니다

---

*멍! 🐶*
