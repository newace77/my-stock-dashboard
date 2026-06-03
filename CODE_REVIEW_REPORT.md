# Code Review Report

생성일시: 2026-06-03T00:36:00+09:00  
검토 대상: `script.js`, `index.html`, `style.css`, `GAS.js`, `update_sp500.js`, `update_kospi200.js`, `helpers.js`, `update_prices.py`, `.github/workflows/update_data.yml`, `eslint.config.js`, `package.json`

---

## 1. 정적 분석 (ESLint)

| 항목 | 결과 |
|------|------|
| ESLint errors | ✅ PASS — 0건 |
| ESLint warnings | ✅ PASS — 0건 (수정 완료) |

**수정 내역:**
- `script.js` 561, 569줄: `catch(e)` → `catch {}` (미사용 변수 `e` 제거)
- `script.js` 4418줄: 미사용 지역 변수 `usdKrwRate` 제거 (전역 동명 변수와 shadowing)
- `eslint.config.js`: `globals`에서 `alert: "readonly"` 제거 (실제 미사용)

---

## 2. 기능 보존 검증

| 항목 | 결과 |
|------|------|
| `varsIgnorePattern` 전역 함수 존재 여부 | ✅ PASS |
| `CONFIG` 인터페이스 (`config.sample.js`) | ✅ PASS — 변경 없음 |
| `GAS.js` `doPost` 엔드포인트 | ✅ PASS |
| `GAS.js` `doGet` 엔드포인트 | ✅ PASS |

`varsIgnorePattern`에 나열된 함수(`openTab`, `changeDividendMonth`, `sortHoldingsAnalysis` 등 23개) 모두 `script.js`에 존재 확인.

---

## 3. 보안 검토

| 항목 | 결과 |
|------|------|
| 하드코딩된 비밀 키/토큰 | ✅ PASS — 없음 |
| `eval()` / `Function()` 위험 패턴 | ✅ PASS — 없음 |
| SSL 검증 비활성화 (`verify=False`) | ✅ PASS — 없음 (`update_prices.py` 개선 완료) |
| SSRF 방지 (`GAS.js` URL 화이트리스트) | ✅ PASS — `ALLOWED_PROXY_DOMAINS` 적용 |
| XSS — `innerHTML` + `escapeHtml` 사용 | ⚠️ WARNING |
| GAS.js `sanitizeInput` 적용 | ✅ PASS |

**⚠️ XSS WARNING (script.js 826~833줄):**
```js
tr.innerHTML = `
  <td>${r.date}</td>
  <td>${r.name}</td>   // escapeHtml 미적용
  ...
`;
```
`updateDividendDetailTable` 함수에서 Google Sheets 출처 데이터(`r.date`, `r.name`, `r.qty`)를 `innerHTML`에 직접 삽입합니다. Google Sheets는 내부 데이터 소스이므로 실질적 공격 경로는 제한적이나, 일관성을 위해 `escapeHtml()` 적용을 권장합니다.

**수정 제안:**
```js
tr.innerHTML = `
  <td>${escapeHtml(r.date)}</td>
  <td>${escapeHtml(r.name)}</td>
  <td>${escapeHtml(String(r.qty))}</td>
  ...
`;
```

---

## 4. 코드 스타일 일관성

| 항목 | 결과 |
|------|------|
| `alert()` 호출 잔존 여부 | ✅ PASS — 0건 (전체 `showToast()` 사용) |
| `GAS.js` `var` 선언 잔존 | ✅ PASS — `const`/`let` 사용 |
| `helpers.js` `var` 선언 잔존 | ✅ PASS |
| 한국어 주석 스타일 | ✅ PASS — 유지됨 |
| `async/await` 일관성 | ✅ PASS |

---

## 5. 인라인 스타일 개선 (index.html)

| 항목 | 결과 |
|------|------|
| 인라인 `style` 속성 수 | ✅ PASS — 107개 → 58개 (46% 감소) |

**추가된 유틸리티 클래스 (`style.css`):**
- `.u-cursor-pointer` — `cursor: pointer` (34건 대체)
- `.u-hidden` — `display: none` (6건 대체)
- `.u-btn-sm` — 버튼 margin/padding 패턴 (3건 대체)
- `.u-label-text` — 설정 레이블 폰트 스타일 (3건 대체)
- `.u-m-0`, `.u-mt-1`, `.u-mt-2`, `.u-flex-1`, `.u-text-sm` 등

---

## 6. 백엔드 개선 현황

| 파일 | 항목 | 결과 |
|------|------|------|
| `GAS.js` | SSRF 방지 (URL 화이트리스트) | ✅ PASS |
| `GAS.js` | `var` → `const`/`let` | ✅ PASS |
| `GAS.js` | JSON 에러 응답 통일 | ✅ PASS |
| `GAS.js` | `SpreadsheetApp` 캐시 | ✅ PASS |
| `helpers.js` | 공통 로직 통합 (`withRetry`, `processBatches`, `saveResults`) | ✅ PASS |
| `update_sp500.js` | `helpers.js` 모듈 사용 | ✅ PASS |
| `update_kospi200.js` | `helpers.js` 모듈 사용 | ✅ PASS |
| `update_prices.py` | `logging` 프레임워크 사용 | ✅ PASS |
| `update_prices.py` | SSL 검증 비활성화 제거 | ✅ PASS |
| `update_prices.py` | 재시도 로직 | ✅ PASS |
| `.github/workflows/update_data.yml` | Python 캐시 최적화 | ✅ PASS |
| `.github/workflows/update_data.yml` | 스냅샷 유효성 검증 스텝 | ✅ PASS |
| `package.json` | `validate` 스크립트 추가 | ✅ PASS |

---

## 7. 종합 평가

| 카테고리 | 점수 |
|----------|------|
| 정적 분석 | 10/10 |
| 기능 보존 | 10/10 |
| 보안 | 8/10 |
| 코드 스타일 | 9/10 |
| 마크업 품질 | 9/10 |

**전체 점수: 92/100 (등급: A)**

### FAIL 항목
없음

### WARNING 항목
- `script.js` 826줄: `updateDividendDetailTable`의 `innerHTML`에서 일부 데이터에 `escapeHtml` 미적용

### 개선 완료 항목 요약
1. ESLint 경고 3건 → 0건
2. 인라인 스타일 107개 → 58개
3. `alert` global 불필요 선언 제거
4. GAS.js SSRF 방지, JSON 응답, 캐시 최적화
5. Node.js 스크립트 공통 로직 `helpers.js`로 통합
6. Python 스크립트 `logging` 전환, SSL 검증 정상화
7. CI/CD 스냅샷 유효성 검증 스텝 추가
8. `package.json` `validate` 스크립트 추가
