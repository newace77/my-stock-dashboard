# 주식 대시보드 개선 TODO 리스트

이 문서는 현재 홈페이지(주식 대시보드) 소스코드 분석 및 정적 테스트를 통해 도출된 개선 사항들을 우선순위별로 정리한 목록입니다.

## 🚨 P0: 런타임 오류 및 크리티컬 버그

- [x] **모바일 뷰 모드 전환 시 자바스크립트 런타임 크래시 해결**
  - **문제 상황**: [script.js](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/script.js#L1181)의 `cycleViewMode()`에서 모바일 환경으로 판단될 때 `switchHoldingsView("cards")`를 호출하지만, 해당 함수의 정의가 존재하지 않아 자바스크립트 실행 오류 발생.
  - **해당 코드**: [script.js (L1181)](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/script.js#L1181)
  - **해결 방안**: [style.css](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/style.css#L919)에 정의된 카드 그리드 스타일(`holdings-cards-grid` 및 `stock-card`)을 실제로 렌더링하도록 `switchHoldingsView` 함수를 신규 구현하거나, 모바일 카드 뷰 구현을 완전히 통합/정리해야 함.

---

## 🛠️ P1: 유지보수성 및 중복 코드 개선

- [x] **S&P 500 및 KOSPI 200 테이블 정렬 및 렌더링 로직 통합**
  - **문제 상황**: [script.js](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/script.js#L1379)와 [script.js](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/script.js#L1509)에 정의된 정렬/렌더링 함수(`sortSP500`/`sortKOSPI200`, `renderSP500Table`/`renderKOSPI200Table`)가 통화 표시와 포맷을 제외하면 90% 이상 동일한 코드 구조를 가짐.
  - **해당 코드**:
    - [sortSP500 & renderSP500Table](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/script.js#L1379-L1462)
    - [sortKOSPI200 & renderKOSPI200Table](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/script.js#L1509-L1595)
  - **해결 방안**: 대상을 매개변수로 받는 범용(Generic) 정렬 및 렌더링 헬퍼 함수를 구현하여 코드 중복을 대폭 줄이고 유지보수성을 향상시킴.

- [x] **데이터 업데이트 스크립트 내 보조 지표 계산 로직 모듈화**
  - **문제 상황**: [update_kospi200.js](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/update_kospi200.js#L7)와 [update_sp500.js](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/update_sp500.js#L8) 내에 보조 지표인 RSI(`calculateRSIValue`) 및 최대 낙폭(`calculateMDDAndRecovery`) 계산 로직이 완벽하게 중복되어 있음.
  - **해당 코드**:
    - [update_kospi200.js (L7-55)](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/update_kospi200.js#L7-L55)
    - [update_sp500.js (L8-56)](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/update_sp500.js#L8-L56)
  - **해결 방안**: 공통 수학/보조 지표 계산 함수를 별도의 유틸리티 파일(예: `helpers.js`)로 추출하여 두 스크립트가 모듈 형식으로 공용으로 불러와 사용할 수 있게 수정.

---

## ⚡ P2: 성능 및 사용자 경험(UX) 개선

- [x] **불필요한 캐시 방지(Cache Busting) 오용 개선**
  - **문제 상황**: 정적 데이터나 JSON 스냅샷을 fetch할 때 쿼리스트링에 매번 `new Date().getTime()`을 강제 추가하여 브라우저의 HTTP 캐싱 메커니즘을 완전히 무력화함. 이로 인해 리소스 낭비 및 불필요한 네트워크 트래픽 발생.
  - **해당 코드**:
    - [script.js (L1247-1249)](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/script.js#L1247-L1249) (Snapshot)
    - [script.js (L1353)](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/script.js#L1353) (S&P 500 데이터)
    - [script.js (L1488-1490)](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/script.js#L1488-L1490) (KOSPI 200 데이터)
  - **해결 방안**: 무분별한 캐시 무효화 쿼리를 제거하고, 1분(시트)/10분(정적 JSON) 단위로 작동하는 `getCacheBuster`를 도입하여 브라우저 HTTP 캐싱이 동작하도록 개선.

- [x] **브라우저 경고 alert() 창 사용 중단 및 커스텀 토스트 대체**
  - **문제 상황**: 유효성 검사 오류나 예외 발생 시 `alert()` 브라우저 대화상자를 호출하여 사용자의 브라우저 흐름을 방해함. 현재 ESLint에서도 글로벌 `alert`가 정의되지 않아 경고가 표시되고 있음.
  - **해당 코드**: [script.js (L1760, L1805, L3125, L3130, L3144)](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/script.js#L1760) 등 5개 위치.
  - **해결 방안**: 이미 [script.js](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/script.js#L1188)에 완성되어 있는 `showToast(message, type)` 공통 알림 함수로 전부 교체.

- [x] **자산 변동 히트맵 최신순 정렬 옵션 또는 역순 렌더링 기능 추가**
  - **문제 상황**: 자산 변동 히트맵이 항상 과거부터 최신순(정방향)으로 고정 렌더링되어 최신 정보를 확인하려면 페이지 하단으로 불필요하게 스크롤해야 함.
  - **해당 코드**: [script.js (L3425-3430)](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/script.js#L3425-L3430)
  - **해결 방안**: 최신 정보가 가장 먼저 표출되도록 하는 역순 루프 옵션을 만들거나, 정렬 방식을 최신순으로 설정하는 UX 개선.

- [x] **종목 하락장(MDD) 계산 시 브라우저 스토리지 캐시 도입**
  - **문제 상황**: 특정 종목의 분석 요청 시 매번 10년 치 야후 파이낸스 역사적 데이터를 직접 새로 요청함. 동일 종목에 대해 불필요하게 야후 API를 재요청하게 됨.
  - **해결 방안**: `localStorage`를 활용해 24시간 캐시 메커니즘을 두어 불필요한 원격 호출 차단.

---

## 🎨 P3: 마크업, 스타일링 및 정적 분석 설정 개선

- [x] **CSS 스타일 중복 정의로 인한 히트맵 테이블 간격 오류 해결**
  - **문제 상황**: [style.css](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/style.css#L1772)와 [style.css](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/style.css#L1799)에 `.heatmap-table` 스타일이 중복 선언되었으며, 아래에 설정된 `border-collapse: collapse;`가 위에 설정된 `border-collapse: separate; border-spacing: 1px;`를 완전히 무효화시킴. 이로 인해 셀 간 구분선이 보이지 않고 가독성이 심각하게 저하됨.
  - **해당 코드**: [style.css (L1772-L1778, L1799-L1801)](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/style.css#L1772)
  - **해결 방안**: 중복된 선택자 정의를 하나로 합치고, 셀 간 1px의 테두리 여백이 미려하게 드러나도록 `separate` 속성과 `spacing` 설정을 살려 레이아웃 수정.

- [x] **HTML 문법 어긋남(줄바꿈 오류로 인한 깨진 태그) 정돈**
  - **문제 상황**: [index.html](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/index.html#L425) 등 여러 위치에서 label 태그를 작성할 때 줄바꿈 실수로 닫는 괄호 `>` 문자가 다음 줄의 input 태그 바로 앞에 부적절하게 위치하고 있음.
  - **해당 코드**:
    - [index.html (L425-426)](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/index.html#L425-L426) (`<label>날짜</label` + `><input ...`)
    - [index.html (L456-457)](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/index.html#L456-L457) (`<label>단가</label` + `><input ...`)
    - [index.html (L460-461)](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/index.html#L460-L461) (`<label id="qty-label">수량/금액</label` + `><input ...`)
  - **해결 방안**: 해당 마크업을 한 줄로 올바르게 묶어 닫는 태그 문법(`<label>날짜</label>`)을 준수하도록 정리.

- [x] **HTML 인라인 CSS 남용 정리**
  - **문제 상황**: [index.html](file:///Users/anjaemo/Documents/Code/my-stock-dashboard) 곳곳에 `style="display: none; flex-direction: column; ..."` 등의 인라인 스타일이 대량으로 하드코딩되어 코드 청결도가 저하됨.
  - **해결 방안**: 스타일 속성들을 CSS 클래스(예: `.direct-input-container` 등)로 분리하고 `style.css`로 정의를 이관함.

- [x] **ESLint 설정 보완 및 린트 경고 제거**
  - **문제 상황**: [eslint.config.js](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/eslint.config.js)의 `globals`에 브라우저 전역 객체인 `AbortController`, `AbortSignal`, `clearTimeout`, `Papa`, `process` 등이 누락되어 `no-undef` 경고가 발생함. 또한 인라인 이벤트 핸들러에서만 사용되는 많은 함수들이 `no-unused-vars` 경고로 등록됨.
  - **해당 코드**: [eslint.config.js](file:///Users/anjaemo/Documents/Code/my-stock-dashboard/eslint.config.js)
  - **해결 방안**: globals 목록에 브라우저 전역 및 Node.js 전역 객체를 보완하고, 사용하지 않는 변수와 모듈 정리.
