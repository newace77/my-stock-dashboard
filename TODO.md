# 📝 바둑이 주식 대시보드 - 개선 TODO

코드 분석(script.js 2,714줄 / index.html 546줄 / style.css 1,766줄 / GAS.js 225줄) 기반, 우선순위별로 정리했습니다.

---

## 🔴 P0: 긴급 / 보안·안정성

### ✅ 1. XSS 취약점 — `innerHTML` + 템플릿 리터럴 조합 (완료)
- `escapeHtml()` + `safeValue()` 헬퍼 추가
- 모든 테이블 렌더(Holdings, SP500, KOSPI200, Summary, MDD), 카드 뷰, 토스트에 적용
- `window.open` URL에 `encodeURIComponent` 적용

### ✅ 2. API Key / Spreadsheet ID 노출 (완료)
- GAS `doPost` 진입부에 `API_KEY` 검증 로직 추가 (Script Properties 기반)
- 클라이언트 측 모든 GAS 호출에 `apiKey: CONFIG.gasApiKey` 포함
- `.gitignore`에 `config.js` 확인 완료

### 3. CORS 프록시 의존성 (`allorigins.win`, `corsproxy.io`)
- 외부 공용 프록시는 언제든 중단·변조 가능 (공급망 리스크)
- **조치**:
  - GAS 프록시 경로 우선순위 1로 유지, 공용 프록시는 명시적 opt-in
  - 또는 Cloudflare Worker 같은 자체 프록시 구축

### 4. `fetch` with `mode: 'no-cors'` (GAS 호출)
- `handleTransactionSubmit` / `requestMarketRefresh`에서 `no-cors` 사용 → **응답을 읽을 수 없음**
- 현재 "성공" UI는 실제 성공 여부와 무관하게 표시됨
- **조치**: GAS Web App을 `Anyone` 액세스로 배포하고 CORS 헤더 설정 후 정상 fetch로 전환

---

## 🟠 P1: 구조·유지보수성

### 5. `script.js` 단일 파일 — 모듈 분리 필요
- 포트폴리오 / MDD / SP500 / KOSPI / 차트 / 모달 / 폼이 한 파일에 혼재
- **제안 구조**:
  ```
  src/
    api/ (fetchWithFallback, parseYahooData, GAS)
    modules/ (summary, holdings, mdd, sp500, kospi200, heatmap)
    charts/ (historyChart, bubbleChart, sparkline, modalChart)
    utils/ (format, mask, sort)
    main.js
  ```
- ESM 모듈로 분리 후 Vite로 번들.

### 6. 전역 변수 남용
- `globalHoldings`, `usdKrwRate`, `rawHistoryData` 등이 모두 최상위 전역
- **조치**: `const Store = { holdings: [], fx: 1400, ... }` 싱글턴 객체로 캡슐화

### ✅ 7. 매직 넘버 / 컬럼 인덱스 하드코딩 (완료)
- `HOLDINGS_COL`, `HISTORY_COL` 상수 매핑 정의 및 적용 완료

### 8. DOM 요소 반복 조회
- `document.getElementById(...)` 가 렌더 함수마다 반복 호출됨
- **조치**: 초기화 시점에 `refs = { eval: $('#card-eval-val'), ... }` 캐싱

### 9. Race Condition 가능성 — `fetchHoldingsAnalysisData`
- 사용자가 탭 전환을 빠르게 하면 이전 요청이 완료되며 최신 상태를 덮어쓸 수 있음
- **조치**: `AbortController` + request id 세대 관리

### ✅ 10. 차트 메모리 누수 위험 (완료)
- `switchHoldingsView`에서 테이블 전환 시 스파크라인 차트 인스턴스 정리 추가
- `chartRegistry` 유틸 추가 (향후 전체 차트에 적용 가능)

---

## 🟡 P2: 성능·UX

### 11. 10년치 히스토리를 모든 종목에 대해 매번 페칭
- **조치**:
  - `localStorage` 에 티커별 일자 기반 캐시 (`expires_at` 포함)
  - 당일 캐시 hit 시 스킵
  - IndexedDB 사용 검토

### 12. 차트 리사이즈 비용
- `window.dispatchEvent(new Event('resize'))` 를 탭 전환마다 호출
- **조치**: 활성 탭의 차트만 resize 호출하도록 대상 지정

### 13. 메인 폰트 CDN
- `cdn.jsdelivr.net/gh/orioncactus/pretendard` 로드 실패 시 폴백 없음
- **조치**: `font-display: swap` + 로컬 시스템 폰트 폴백 명시

### 14. 스파크라인 데이터가 가짜(Random noise 기반)
- **조치**: Yahoo 5일 차트 데이터를 받아서 실 데이터 표시, 혹은 레이블 명시

### 15. 초기 로딩 UX
- **조치**: 캐시가 없을 때 스냅샷으로 즉시 렌더 → 라이브 데이터로 덮어쓰기

### ✅ 16. 모바일 테이블 가독성 (완료)
- CSS `font-variant-numeric: tabular-nums` 적용

### ✅ 17. 환율 의존 계산의 fallback (완료)
- `usdKrwRateUpdatedAt` 타임스탬프 추가
- `isExchangeRateValid()` 헬퍼로 30분 stale 체크 적용

---

## 🟢 P3: 코드 퀄리티

### 18. 중복 함수 — SP500 / KOSPI200 정렬·렌더가 거의 동일
- **조치**: `createStockIndexTab({tableId, data, sortState, isKRW})` 팩토리로 통합

### 19. `sortHoldings` 와 `sortHoldingsAnalysis` 역시 중복 패턴
- 범용 `sortByColumn(array, state, numericKeys)` 유틸로 추출

### ✅ 20. `console.log` / `console.warn` 프로덕션에도 노출 (완료)
- `logger` 객체 도입 (DEBUG 플래그 기반)
- 모든 `console.log/warn/error` → `logger.log/warn/error` 교체

### 21. 에러 처리 불일치
- **조치**: 에러 레벨(info/warn/error) 기준으로 `showToast` 일원화

### ✅ 22. `GAS.js` 내부도 2곳에 같은 `accountMap` 선언됨 (완료)
- 상단에 `var ACCOUNT_MAP = {...}` 단일 소스로 통합

### ✅ 23. 미사용 / 죽은 코드 (완료)
- `fetchFromSupabase` 제거
- `GAS.js`에서 `forceAuth()`, `authTest()` 제거

### 24. `update_sp500.js` / `update_kospi200.js` 중복
- 공용 모듈로 `updateIndex(market)` 추출

### ✅ 25. `backup_20260501/` 폴더 (완료)
- 리포지토리에서 삭제 완료

### ✅ 26. package.json (완료)
- ESLint + Prettier devDependencies 추가
- `npm run lint`, `npm run format` 스크립트 정의

### ✅ 27. 일관성 없는 통화 판별 (완료)
- `isKoreanStock(ticker)` 유틸 함수 추출 및 전체 적용

### ✅ 28. Chart.js 인스턴스 관리 (완료)
- `chartRegistry` 객체 추가 (set/get/destroy/destroyAll)

---

## 🔵 P4: 접근성·국제화

### ✅ 29. 접근성 (a11y) (부분 완료)
- ✅ 테이블 헤더에 `scope="col"` 추가
- ✅ 탭에 `role="tab"`, `aria-selected`, `aria-controls` 추가
- ✅ 탭 패널에 `role="tabpanel"` 추가
- ✅ 모달에 `role="dialog"`, `aria-modal="true"` 추가
- ⬜ 모달 focus trap 미구현
- ⬜ 차트 대체 텍스트 미구현

### 30. 색상 대비
- 수익/손실을 색상으로만 구분 → 색각 이상자를 위해 ↑/↓ 아이콘 보강 (일부 반영됨)

### 31. i18n 준비 부족
- 당장은 불필요해도 `i18n.js` 에 키로 분리해두면 유지보수에 유리

---

## 🛠 P5: 개발 환경·배포

### 32. 테스트 전무
- **조치**: Vitest + JSDOM, 최소 `parseSafeFloat`, `calculateRSIValue`, `calculateMDDAndRecovery`, `formatTicker` 부터 테스트

### 33. CI가 GitHub Actions 데이터 갱신 워크플로 1개뿐
- **조치**: push 시 `npm run lint`, `npm run test`, HTML validator 구동

### 34. 타입 안전성
- 순수 JS → JSDoc으로 시작해서 점진적 TypeScript 마이그레이션 고려

### 35. 빌드 파이프라인
- **조치**: Vite + `vite build` 로 전환, GitHub Pages 자동 배포 워크플로 추가

### 36. `config.js` 관리
- **조치**: README.md 생성, 셋업/배포/GAS 권한 순서 정리

---

## 🎯 완료 현황

| 카테고리 | 완료 | 미완료 | 진행률 |
|----------|------|--------|--------|
| P0 보안 | 2 | 2 | 50% |
| P1 구조 | 3 | 3 | 50% |
| P2 성능 | 3 | 4 | 43% |
| P3 코드 | 7 | 3 | 70% |
| P4 접근성 | 1(부분) | 2 | 33% |
| P5 개발환경 | 1 | 4 | 20% |
| **합계** | **16** | **18** | **47%** |

---

## 📌 참고

- 분석 대상: `script.js`, `index.html`, `style.css`, `GAS.js`, `update_*.js`, `package.json`, `config.sample.js`
- 분석 일: 2026-05-11
- 최종 업데이트: 2026-05-11
