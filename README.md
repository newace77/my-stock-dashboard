# 🐶 바둑이 주식 대시보드 (My Stock Dashboard)

Google Sheets를 데이터베이스로 활용하여 개인 주식 포트폴리오를 실시간으로 시각화하고 관리하는 서버리스(Serverless) 웹 대시보드입니다.

## 🌟 주요 특징 (Features)

*   **실시간 포트폴리오 요약**: 총 평가액, 투자액, 수익금, 수익률, 배당금, 달러 자산 비중 등을 한눈에 파악.
*   **다양한 데이터 시각화**:
    *   보유 종목 비중 파이 차트
    *   날짜별 총 평가액 및 투자금 추이 라인 차트
    *   수익률/변동률 버블 차트 (Bubble Chart)
*   **시장 지수 모니터링**: S&P 500, NASDAQ, KOSPI, USD/KRW 환율, 금, 비트코인 시세 제공.
*   **MDD (최대 낙폭) 분석**: 포트폴리오의 리스크를 평가하고 과거 회복 패턴을 분석.
*   **지수 구성 종목 분석 (S&P 500 & KOSPI 200)**:
    *   S&P 500 및 KOSPI 200 시가총액 상위 100 종목의 실시간 시세, 변동률 표시.
    *   각 종목별 MDD, 회복 확률, RSI(14), 배당률 등 기술적 지표 제공.
    *   시가총액 및 주요 지표별 실시간 정렬 지원.
*   **간편한 매매 기록**: 대시보드 내 폼에서 직접 매수/매도, 배당금, 입출금 내역을 입력하면 Google Sheets(`record` 시트)에 자동 동기화.
*   **고가용성 아키텍처 (CORS 프록시 & 자동 스냅샷)**: Google Sheets CSV 직접 접근, 다중 CORS 프록시, GitHub Actions를 통한 정기 스냅샷(JSON)을 결합하여 무중단 데이터 로딩 지원.

---

## 🏗 아키텍처 및 데이터 흐름 (Architecture)

본 프로젝트는 별도의 데이터베이스 서버 없이 동작하도록 설계되었습니다.

1.  **데이터 저장 (DB)**: Google Sheets & 정적 JSON
    *   `Summary`, `Holdings`, `History`: 구글 시트에서 관리되는 개인 포트폴리오 데이터.
    *   `sp500_data.json`, `kospi200_data.json`: 지수 구성 종목 분석을 위한 정적 데이터 파일.
2.  **데이터 로딩 (Frontend)**:
    *   **Primary**: `data_snapshot.json` (가장 빠름, GitHub Actions가 15분마다 갱신)
    *   **Secondary (Fallback)**: Google Sheets 웹 게시 CSV 직접 요청
    *   **Market Data**: 분석용 지수 데이터는 `sp500_data.json` 및 `kospi200_data.json`을 통해 로딩.
    *   **Tertiary (CORS Proxy)**: 직접 요청 실패 시 프록시를 경유하여 데이터 확보.
3.  **데이터 쓰기 (Backend)**: Google Apps Script (GAS)
    *   프론트엔드에서 폼 제출 시 GAS Webhook(`doPost`)으로 전송되어 구글 시트에 행(Row) 추가.

---

## 🚀 시작하기 (Getting Started)

### 1. 환경 설정 파일 준비
프로젝트 루트 경로에 있는 `config.sample.js`를 복사하여 `config.js`를 생성합니다.

```bash
cp config.sample.js config.js
```

### 2. 시장 지수 분석 데이터 업데이트 (Optional)
S&P 500 및 KOSPI 200 상위 100 종목 데이터를 최신화하려면 다음 스크립트를 실행합니다. (Node.js 환경 필요)

```bash
# S&P 500 상위 100 종목 업데이트
node update_sp500.js

# KOSPI 200 상위 100 종목 업데이트
node update_kospi200.js
```
*주의: 이 스크립트들은 `yahoo-finance2` 라이브러리를 사용하며, 실행 결과로 `sp500_data.json` 및 `kospi200_data.json` 파일이 갱신됩니다.*

### 3. Google Sheets "웹에 게시" 및 URL 연동
1.  사용할 구글 시트에서 **파일 > 공유 > 웹에 게시**를 클릭합니다.
2.  `Summary`, `Holdings`, `History` 시트를 각각 **CSV 형식**으로 게시하고 URL을 복사합니다.
3.  `config.js` 파일에 복사한 URL들을 입력합니다.

### 4. Google Apps Script (GAS) 백엔드 배포
1.  구글 시트의 **확장 프로그램 > Apps Script**를 엽니다.
2.  레포지토리의 `GAS.js` 파일 내용을 복사해 붙여넣습니다.
3.  코드 내의 `ACCOUNT_MAP` (계좌 및 스프레드시트 ID 매핑)을 자신의 환경에 맞게 수정합니다.
4.  우측 상단의 **배포 > 새 배포 > 웹 앱** (모든 사용자 접근 권한)으로 배포합니다.
5.  생성된 웹 앱 URL을 `config.js`의 `gasURL` 항목에 입력합니다.

### 5. GitHub Actions 자동화 설정
1.  GitHub 레포지토리의 **Settings > Secrets and variables > Actions**로 이동합니다.
2.  아래의 3가지 시크릿을 추가합니다.
    *   `SHEET_SUMMARY_URL`
    *   `SHEET_HOLDINGS_URL`
    *   `SHEET_HISTORY_URL`
3.  매 15분마다 (또는 수동 실행 시) `.github/workflows/update_data.yml` 워크플로우가 실행되어 `data_snapshot.json`을 갱신합니다.

### 6. 로컬 개발 서버 실행
```bash
# npm 사용 시
npm install
npm start

# python 사용 시
python3 -m http.server 8000
```
웹 브라우저에서 `http://localhost:8000` (또는 3000)으로 접속하여 대시보드를 확인합니다.

---

## 🛠 배포 (Deployment)
정적 파일(`index.html`, `style.css`, `script.js`, `config.js`, `data_snapshot.json` 등)로 구성되어 있으므로 **GitHub Pages, Netlify, Vercel** 등을 통해 무료로 쉽게 배포할 수 있습니다.

---

*개인 주식 관리를 더 쉽고 직관적으로! 멍! 🐶*
