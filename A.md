# 🐶 바둑이 주식 대시보드 — 멀티 에이전트 코드 개선 프롬프트

> **이 파일을 Antigravity(또는 다른 AI 에이전트)에 그대로 입력하면, 서브에이전트 3개가 병렬로 코드를 리뷰→개선→검증합니다.**

---

## 🎯 목표

현재 프로젝트(`my-stock-dashboard`)의 **프론트엔드**와 **백엔드** 코드를 전반적으로 검토하고 개선하되, **코드 검증까지 자동화된 파이프라인**으로 처리한다.

---

## 📁 프로젝트 구조 요약

| 레이어 | 파일 | 설명 |
|--------|------|------|
| **프론트엔드** | `index.html` (65KB) | 메인 HTML 마크업 |
| | `script.js` (5,466줄) | 모든 UI 로직, 차트, 데이터 처리 |
| | `style.css` (54KB) | 전체 스타일시트 |
| | `config.sample.js` / `config.js` | 설정 파일 |
| **백엔드** | `GAS.js` (277줄) | Google Apps Script 웹훅 서버 |
| | `update_sp500.js` (128줄) | S&P 500 데이터 업데이트 (Node.js) |
| | `update_kospi200.js` (142줄) | KOSPI 200 데이터 업데이트 (Node.js) |
| | `helpers.js` (55줄) | RSI/MDD 계산 공용 모듈 |
| | `update_prices.py` (116줄) | GitHub Actions 스냅샷 빌더 (Python) |
| **CI/CD** | `.github/workflows/update_data.yml` | 15분 주기 데이터 갱신 |
| **설정** | `eslint.config.js`, `package.json` | 린트 & 의존성 |

---

## 🤖 에이전트 구성 (3개 서브에이전트)

### Agent 1: 프론트엔드 코드 개선 에이전트

**역할**: `index.html`, `script.js`, `style.css`, `config.sample.js`를 리뷰하고 개선한다.

**작업 범위**:

1. **코드 구조 개선 (script.js 분할 검토)**
   - 5,466줄짜리 `script.js`의 논리적 모듈 분리 가능성 분석
   - 관련 함수 그룹핑 및 코드 섹션 정리 (현재 단일 파일 유지 기준)
   - 중복 로직 식별 및 공용 헬퍼 함수 추출

2. **HTML 마크업 개선**
   - 시맨틱 HTML5 태그 적용 (접근성 개선)
   - 인라인 스타일(`style="..."`) → CSS 클래스 분리
   - 깨진 태그 문법 수정 (TODO.md P3 참조)

3. **CSS 품질 개선**
   - 중복 선택자 통합 (`.heatmap-table` 등)
   - CSS 변수(Custom Properties) 활용한 디자인 토큰 정리
   - 미사용 스타일 정리

4. **JavaScript 코드 품질**
   - `alert()` → `showToast()` 전면 교체
   - 에러 핸들링 패턴 통일 (try-catch + 사용자 피드백)
   - `async/await` 패턴 일관성 확보
   - 매직 넘버/문자열 상수화
   - ESLint 경고 제거

5. **성능 최적화**
   - 불필요한 캐시 버스팅 개선
   - DOM 조작 최적화 (DocumentFragment, 배치 렌더링)
   - 이벤트 리스너 정리 (메모리 누수 방지)

**금지 사항**:
- 기존 기능을 제거하거나 동작을 변경하지 않는다
- 프레임워크(React, Vue 등) 도입을 하지 않는다
- `config.js`(실제 설정 파일)는 수정하지 않는다

**산출물**: 개선된 `index.html`, `script.js`, `style.css` 파일 + 변경 사항 요약 리포트

---

### Agent 2: 백엔드 코드 개선 에이전트

**역할**: `GAS.js`, `update_sp500.js`, `update_kospi200.js`, `helpers.js`, `update_prices.py`, `.github/workflows/update_data.yml`를 리뷰하고 개선한다.

**작업 범위**:

1. **GAS.js (Google Apps Script) 개선**
   - SSRF(Server-Side Request Forgery) 취약점 해결: `data.url` 프록시가 URL 검증 없이 임의 주소를 fetch하는 문제
   - 입력값 유효성 검사 강화 (XSS, Injection 방지)
   - 에러 응답 포맷 통일 (JSON 응답 전환 권장)
   - `var` → `const`/`let` 전환 (GAS V8 런타임 기준)
   - 반복되는 `SpreadsheetApp.openById()` 호출 최적화

2. **Node.js 데이터 업데이트 스크립트 통합**
   - `update_sp500.js`와 `update_kospi200.js` 간 90% 이상 중복되는 fetch-process-save 로직 통합
   - 공통 로직을 `helpers.js`에 추가하거나 별도 모듈로 분리
   - 에러 핸들링 및 재시도(retry) 로직 추가
   - 환경변수/설정 기반 실행 옵션 지원

3. **Python 스크립트 (update_prices.py) 개선**
   - SSL 검증 비활성화(`ssl._create_default_https_context`) 제거 및 안전한 대안 제시
   - `requests` 라이브러리의 `verify=False` 제거
   - 로깅 프레임워크 도입 (print → logging)
   - 에러 처리 및 복원력 향상

4. **CI/CD 워크플로우 개선**
   - Python 캐시 최적화
   - 실패 알림 추가 (옵션)
   - 스냅샷 유효성 검증 스텝 추가

5. **공통 설정**
   - `eslint.config.js` 규칙 강화 및 globals 정리
   - `package.json` scripts 확장 (테스트, 검증 등)

**금지 사항**:
- `ACCOUNT_MAP`의 실제 값(스프레드시트 ID)은 수정하지 않는다
- GitHub Actions 시크릿 키 이름은 변경하지 않는다
- 기존 데이터 구조(JSON 스키마)를 변경하지 않는다

**산출물**: 개선된 백엔드 파일들 + 변경 사항 요약 리포트

---

### Agent 3: 코드 검증 에이전트

**역할**: Agent 1, 2가 개선한 코드를 독립적으로 검증하고 품질 리포트를 생성한다.

> ⚠️ **이 에이전트는 Agent 1, 2의 작업이 완료된 후에 실행한다.**

**검증 항목**:

1. **정적 분석**
   - ESLint 실행 (`npm run lint`) → 경고/에러 0건 목표
   - HTML 유효성 검사 (태그 매칭, 속성 정합성)
   - CSS 문법 유효성 확인

2. **기능 보존 검증**
   - 기존에 정의된 모든 전역 함수가 여전히 존재하는지 확인
   - `eslint.config.js`의 `varsIgnorePattern`에 나열된 함수들이 모두 유효한지 확인
   - `CONFIG` 객체의 인터페이스가 변경되지 않았는지 확인
   - GAS.js의 `doPost`, `doGet` 엔드포인트 시그니처 보존 확인

3. **보안 검토**
   - 하드코딩된 비밀 키, 토큰이 없는지 확인
   - XSS 취약점 패턴 검색 (`innerHTML` 사용 시 입력값 이스케이프 확인)
   - `eval()`, `Function()` 등 위험 패턴 부재 확인

4. **코드 스타일 일관성**
   - 들여쓰기, 따옴표, 세미콜론 일관성
   - 주석 및 JSDoc 형식 통일
   - 네이밍 컨벤션 (camelCase 일관성)

5. **최종 리포트 작성**
   - ✅ PASS / ❌ FAIL / ⚠️ WARNING 항목별 정리
   - 발견된 문제에 대한 수정 제안 (있을 경우)
   - 전체 코드 품질 점수 (A~F 등급)

**산출물**: `CODE_REVIEW_REPORT.md` 파일 (검증 결과 리포트)

---

## 🔄 실행 순서

```
Phase 1 (병렬 실행)
├── Agent 1: 프론트엔드 개선 ──┐
└── Agent 2: 백엔드 개선 ──────┤
                                │
Phase 2 (순차 실행)             ▼
└── Agent 3: 코드 검증 ────────→ CODE_REVIEW_REPORT.md
```

---

## 📋 실행 지침

1. **Agent 1과 Agent 2는 별도의 브랜치(또는 워크스페이스)에서 독립적으로 작업**한다.
2. 각 에이전트는 작업 완료 후 **변경 사항 요약 리포트**를 작성한다.
3. Agent 3은 Agent 1, 2의 결과물을 통합한 상태에서 검증을 수행한다.
4. Agent 3의 검증에서 **FAIL 항목이 있으면**, 해당 에이전트(1 또는 2)에게 수정을 요청한다.
5. 모든 검증 항목이 PASS될 때까지 반복한다.

---

## ⚙️ 기술 제약 조건

- **프레임워크 도입 금지**: 바닐라 JS/CSS/HTML 기반 유지
- **파일 구조 유지**: 기존 파일명과 경로를 변경하지 않는다
- **기능 보존 필수**: 모든 기존 기능이 동일하게 동작해야 한다
- **한국어 주석 유지**: 기존 한국어 주석 스타일을 따른다
- **하위 호환성**: `config.js` 인터페이스, GAS 엔드포인트, JSON 데이터 스키마 변경 금지
