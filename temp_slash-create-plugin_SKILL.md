---
name: slash-create-plugin
description: "컴포넌트 설계, 구현 및 검증을 포함하는 가이드 기반의 엔드투엔드 플러그인 생성 워크플로우입니다. 사용자가 `/create-plugin`을 호출하거나 변환된 Claude 명령 워크플로우를 요청할 때 사용합니다."
---

# create-plugin

로컬 Claude Code 슬래시 명령에서 Obsigravity에 의해 변환되었습니다.

- 소스: `/Users/anjaemo/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/commands/create-plugin.md`
- 원래 종류: `command`

## 사용법

사용자가 `/create-plugin`을 호출하거나 변환된 Claude 명령 워크플로우를 요청할 때 사용합니다.

## 원래 지침

# 플러그인 생성 워크플로우

초기 개념부터 테스트된 구현까지 완전하고 고품질의 Claude Code 플러그인을 생성하도록 사용자를 안내합니다. 체계적인 접근 방식을 따릅니다: 요구 사항 이해, 컴포넌트 설계, 세부 사항 명확화, 모범 사례를 따른 구현, 검증 및 테스트.

## 핵심 원칙

- **명확한 질문 던지기**: 플러그인 목적, 트리거, 범위 및 컴포넌트에 대한 모든 모호성을 식별합니다. 가정을 하기보다는 구체적이고 실제적인 질문을 하십시오. 구현을 진행하기 전에 사용자의 답변을 기다립니다.
- **관련 스킬 로드**: 필요할 때 Skill 도구를 사용하여 plugin-dev 스킬(plugin-structure, hook-development, agent-development 등)을 로드합니다.
- **전용 에이전트 사용**: AI 지원 개발을 위해 agent-creator, plugin-validator, skill-reviewer 에이전트를 활용합니다.
- **모범 사례 준수**: plugin-dev 자체 구현의 패턴을 적용합니다.
- **단계적 공개**: 참조/예제가 포함된 간결한 스킬을 생성합니다.
- **TodoWrite 사용**: 모든 단계에서 모든 진행 상황을 추적합니다.

**최초 요청:** $ARGUMENTS

---

## Phase 1: Discovery

**목표**: 빌드해야 하는 플러그인이 무엇이고 어떤 문제를 해결하는지 이해합니다.

**작업**:

1. 7가지 단계를 모두 포함하는 할 일 목록(todo list)을 작성합니다.
2. 매개변수(arguments)를 통해 플러그인의 목적이 명확한 경우:
   - 이해한 내용을 요약합니다.
   - 플러그인 유형을 식별합니다(통합, 워크플로우, 분석, 툴킷 등).
3. 플러그인의 목적이 불명확한 경우 사용자에게 질문합니다:
   - 이 플러그인은 어떤 문제를 해결하나요?
   - 누가 언제 사용하나요?
   - 무엇을 해야 하나요?
   - 참조할 만한 유사한 플러그인이 있나요?
4. 이해한 내용을 요약하고 진행하기 전에 사용자의 확인을 받습니다.

**산출물**: 플러그인 목적과 대상 사용자에 대한 명확한 진술

---

## Phase 2: Component Planning

**목표**: 필요한 플러그인 컴포넌트를 결정합니다.

이 단계 전에 **반드시 Skill 도구를 사용하여 plugin-structure 스킬을 로드해야 합니다.**

**작업**:

1. 컴포넌트 유형을 이해하기 위해 plugin-structure 스킬을 로드합니다.
2. 플러그인 요구 사항을 분석하고 필요한 컴포넌트를 결정합니다:
   - **Skills**: 전문 지식 또는 사용자 시작 작업(배포, 구성, 분석). 두 경우 모두 스킬 형식이 선호됩니다 - 아래 참고 사항을 참조하십시오.
   - **Agents**: 자율 작업이 필요한가요? (검증, 생성, 분석)
   - **Hooks**: 이벤트 기반 자동화가 필요한가요? (검증, 알림)
   - **MCP**: 외부 서비스 통합이 필요한가요? (데이터베이스, API)
   - **Settings**: 사용자 구성이 필요한가요? (.local.md 파일)

   > **참고:** `commands/` 디렉토리는 레거시 형식입니다. 새 플러그인의 경우 사용자가 호출하는 슬래시 명령은 `skills/<name>/SKILL.md`에 스킬로 생성해야 합니다. 둘 다 동일하게 로드되며, 유일한 차이점은 파일 레이아웃입니다. `commands/`는 수용 가능한 레거시 대안으로 남아 있습니다.

3. 필요한 각 컴포넌트 유형에 대해 다음을 식별합니다:
   - 각 유형별 개수
   - 각 컴포넌트가 하는 일
   - 대략적인 트리거/사용 패턴
4. 컴포넌트 계획을 사용자에게 표로 제시합니다:
   ```
   | Component Type | Count | Purpose |
   |----------------|-------|---------|
   | Skills         | 5     | Hook patterns, MCP usage, deploy, configure, validate |
   | Agents         | 1     | Autonomous validation |
   | Hooks          | 0     | Not needed |
   | MCP            | 1     | Database integration |
   ```
5. 사용자의 확인 또는 조정을 받습니다.

**산출물**: 생성할 컴포넌트의 확정된 목록

---

## Phase 3: Detailed Design & Clarifying Questions

**목표**: 각 컴포넌트를 자세히 명세하고 모든 모호성을 해결합니다.

**중요**: 가장 중요한 단계 중 하나입니다. 건너뛰지 마십시오.

**작업**:

1. 계획된 각 컴포넌트에 대해 명확하지 않은 부분을 식별합니다:
   - **Skills**: 무엇이 트리거하나요? 어떤 지식을 제공하나요? 얼마나 상세한가요? 사용자가 호출하는 스킬의 경우: 어떤 매개변수, 어떤 도구, 대화형인가요 아니면 자동화형인가요?
   - **Agents**: 언제 트리거하나요(자동형/반응형)? 어떤 도구가 필요한가요? 출력 형식은 무엇인가요?
   - **Hooks**: 어떤 이벤트인가요? 프롬프트 기반인가요 아니면 명령 기반인가요? 검증 기준은 무엇인가요?
   - **MCP**: 어떤 서버 유형인가요? 인증은 어떻게 하나요? 어떤 도구를 사용하나요?
   - **Settings**: 어떤 필드가 있나요? 필수인가요 선택인가요? 기본값은 무엇인가요?

2. **사용자에게 정리된 섹션으로 모든 질문을 제시합니다** (컴포넌트 유형별로 하나의 섹션)

3. **구현을 진행하기 전에 답변을 기다립니다**

4. 사용자가 "당신이 최선이라고 생각하는 대로 하세요"라고 답하면, 구체적인 권장 사항을 제공하고 명시적인 확인을 받습니다.

**스킬에 대한 질문 예시**:

- 이 스킬을 트리거할 구체적인 사용자 쿼리는 무엇인가요?
- 유틸리티 스크립트를 포함해야 하나요? 어떤 기능인가요?
- 핵심 SKILL.md 파일과 references/ 파일들의 상세 정보 비율은 어떻게 해야 하나요?
- 포함할 실제 사례가 있나요?

**에이전트에 대한 질문 예시**:

- 이 에이전트는 특정 작업 후에 자동으로 트리거되어야 하나요, 아니면 명시적으로 요청될 때만 트리거되어야 하나요?
- 어떤 도구가 필요한가요 (Read, Write, Bash 등)?
- 출력 형식은 무엇이어야 하나요?
- 적용할 구체적인 품질 기준이 있나요?

**산출물**: 각 컴포넌트에 대한 세부 사양

---

## Phase 4: Plugin Structure Creation

**목표**: 플러그인 디렉토리 구조와 매니페스트를 생성합니다.

**작업**:

1. 플러그인 이름을 결정합니다 (kebab-case, 설명적임)
2. 플러그인 위치를 선택합니다:
   - 사용자에게 물어봅니다: "플러그인을 어디에 생성할까요?"
   - 옵션 제공: 현재 디렉토리, ../new-plugin-name, 사용자 정의 경로
3. bash를 사용하여 디렉토리 구조를 생성합니다:
   ```bash
   mkdir -p plugin-name/.claude-plugin
   mkdir -p plugin-name/skills/<skill-name>   # 스킬당 디렉토리 하나씩, 각각 SKILL.md 포함
   mkdir -p plugin-name/agents                # 필요한 경우
   mkdir -p plugin-name/hooks                 # 필요한 경우
   # 참고: plugin-name/commands/는 skills/의 레거시 대안입니다. skills/를 권장합니다.
   ```
4. Write 도구를 사용하여 plugin.json 매니페스트를 생성합니다:
   ```json
   {
     "name": "plugin-name",
     "version": "0.1.0",
     "description": "[brief description]",
     "author": {
       "name": "[author from user or default]",
       "email": "[email or default]"
     }
   }
   ```
5. README.md 템플릿을 생성합니다.
6. 필요한 경우 .gitignore를 생성합니다 (.claude/\*.local.md 등 제외용)
7. 새 디렉토리를 만드는 경우 git 저장소를 초기화합니다.

**산출물**: 플러그인 디렉토리 구조가 생성되어 컴포넌트가 준비됨

---

## Phase 5: Component Implementation

**목표**: 모범 사례에 따라 각 컴포넌트를 생성합니다.

각 컴포넌트 유형을 구현하기 전에 **관련 스킬을 로드해야 합니다**:

- Skills: skill-development 스킬 로드
- 레거시 `commands/` 형식 (사용자가 명시적으로 요청한 경우에만): command-development 스킬 로드
- Agents: agent-development 스킬 로드
- Hooks: hook-development 스킬 로드
- MCP: mcp-integration 스킬 로드
- Settings: plugin-settings 스킬 로드

**각 컴포넌트에 대한 작업**:

### For Skills:

1. Skill 도구를 사용하여 skill-development 스킬을 로드합니다.
2. 각 스킬에 대해:
   - 사용자에게 구체적인 사용 사례를 요청합니다 (또는 3단계의 내용 사용)
   - 리소스를 계획합니다 (scripts/, references/, examples/)
   - 스킬 디렉토리를 생성합니다: `skills/<skill-name>/`
   - 다음과 같이 `SKILL.md`를 작성합니다:
     - 구체적인 트리거 문구가 포함된 3인칭 시점의 설명
     - 명령형 문체로 작성된 간결한 본문 (1,500-2,000 단어)
     - 지원 파일에 대한 참조
   - 사용자가 호출하는 스킬(슬래시 명령)의 경우: frontmatter에 `description`, `argument-hint`, `allowed-tools`를 포함합니다. Claude를 위한 지침을 작성하십시오 (사용자에게 주는 것이 아님).
   - 상세한 콘텐츠를 위한 참조 파일을 생성합니다.
   - 작동하는 코드를 위한 예제 파일을 생성합니다.
   - 필요한 경우 유틸리티 스크립트를 생성합니다.
3. skill-reviewer 에이전트를 사용하여 각 스킬을 검증합니다.

### For legacy `commands/` format (only if user explicitly requests):

> 새 플러그인에는 `skills/<name>/SKILL.md`를 사용하는 것이 좋습니다. 이 레이아웃을 이미 사용하는 기존 플러그인을 유지 관리할 때만 `commands/`를 사용하십시오.

1. Skill 도구를 사용하여 command-development 스킬을 로드합니다.
2. 각 명령에 대해:
   - frontmatter가 포함된 명령 마크다운을 작성합니다.
   - 명확한 설명과 argument-hint를 포함합니다.
   - allowed-tools를 지정합니다 (필요한 최소한으로).
   - Claude를 위한 지침을 작성하십시오 (사용자에게 주는 것이 아님).
   - 사용 예시와 팁을 제공합니다.
   - 해당하는 경우 관련 스킬을 참조합니다.

### For Agents:

1. Skill 도구를 사용하여 agent-development 스킬을 로드합니다.
2. 각 에이전트에 대해 agent-creator 에이전트를 사용합니다:
   - 에이전트가 해야 할 일에 대한 설명을 제공합니다.
   - agent-creator가 생성합니다: identifier, 예시가 포함된 whenToUse, systemPrompt
   - frontmatter와 시스템 프롬프트가 포함된 에이전트 마크다운 파일을 생성합니다.
   - 적절한 모델, 색상, 도구를 추가합니다.
   - validate-agent.sh 스크립트로 검증합니다.

### For Hooks:

1. Skill 도구를 사용하여 hook-development 스킬을 로드합니다.
2. 각 훅에 대해:
   - 훅 구성이 포함된 hooks/hooks.json을 생성합니다.
   - 복잡한 로직의 경우 프롬프트 기반 훅을 선호합니다.
   - 이식성을 위해 ${CLAUDE_PLUGIN_ROOT}를 사용합니다.
   - 필요한 경우 훅 스크립트를 생성합니다 (scripts/가 아닌 examples/에 생성).
   - validate-hook-schema.sh 및 test-hook.sh 유틸리티로 테스트합니다.

### For MCP:

1. Skill 도구를 사용하여 mcp-integration 스킬을 로드합니다.
2. 다음과 같이 .mcp.json 구성을 생성합니다:
   - 서버 유형 (로컬은 stdio, 호스팅은 SSE)
   - 명령 및 인수 (${CLAUDE_PLUGIN_ROOT} 포함)
   - LSP인 경우 extensionToLanguage 매핑
   - 필요한 환경 변수
3. README에 필요한 환경 변수를 문서화합니다.
4. 설치 지침을 제공합니다.

### For Settings:

1. Skill 도구를 사용하여 plugin-settings 스킬을 로드합니다.
2. README에 설정 템플릿을 생성합니다.
3. 예제 .claude/plugin-name.local.md 파일을 생성합니다 (문서용).
4. 필요한 경우 hooks/commands에서 설정 읽기를 구현합니다.
5. .gitignore에 추가합니다: `.claude/*.local.md`

**진행 상황 추적**: 각 컴포넌트가 완료될 때마다 할 일(todo)을 업데이트합니다.

**산출물**: 모든 플러그인 컴포넌트 구현 완료

---

## Phase 6: Validation & Quality Check

**목표**: 플러그인이 품질 표준을 충족하고 올바르게 작동하는지 확인합니다.

**작업**:

1. **plugin-validator 에이전트 실행**:
   - plugin-validator 에이전트를 사용하여 플러그인을 포괄적으로 검증합니다.
   - 검사 항목: manifest, structure, naming, components, security
   - 검증 보고서 검토
2. **해결이 필요한 문제 수정**:
   - 검증의 중요한 오류를 해결합니다.
   - 실제 문제를 나타내는 경고를 수정합니다.
3. **skill-reviewer로 검토** (플러그인에 스킬이 있는 경우):
   - 각 스킬에 대해 skill-reviewer 에이전트를 사용합니다.
   - 설명 품질, 단계적 공개, 작성 스타일을 검사합니다.
   - 권장 사항을 적용합니다.
4. **에이전트 트리거 테스트** (플러그인에 에이전트가 있는 경우):
   - 각 에이전트에 대해 `<example>` 블록이 명확한지 확인합니다.
   - 트리거 조건이 구체적인지 확인합니다.
   - 에이전트 파일에 대해 validate-agent.sh를 실행합니다.
5. **훅 구성 테스트** (플러그인에 훅이 있는 경우):
   - hooks/hooks.json에 대해 validate-hook-schema.sh를 실행합니다.
   - test-hook.sh로 훅 스크립트를 테스트합니다.
   - ${CLAUDE_PLUGIN_ROOT} 사용을 확인합니다.
6. **결과 제시**:
   - 검증 결과 요약
   - 남은 문제
   - 전반적인 품질 평가
7. **사용자에게 질문**: "검증이 완료되었습니다. 발견된 문제: 중요 [count critical]개, 경고 [count warnings]개. 지금 수정할까요, 아니면 테스트로 진행할까요?"

**산출물**: 검증이 완료되고 테스트 준비가 된 플러그인

---

## Phase 7: Testing & Verification

**목표**: Claude Code에서 플러그인이 올바르게 작동하는지 테스트합니다.

**작업**:

1. **설치 방법**:
   - 로컬에서 테스트하는 방법을 사용자에게 보여줍니다:
     ```bash
     cc --plugin-dir /path/to/plugin-name
     ```
   - 또는 프로젝트 테스트를 위해 `.claude-plugin/`에 복사합니다.
2. **사용자가 수행할 확인 체크리스트**:
   - [ ] 트리거될 때 스킬이 로드됨 (트리거 문구를 사용하여 질문)
   - [ ] 사용자가 호출한 스킬이 `/help`에 표시되고 올바르게 실행됨
   - [ ] 에이전트가 적절한 시나리오에서 트리거됨
   - [ ] 이벤트 발생 시 훅이 활성화됨 (해당하는 경우)
   - [ ] MCP 서버가 연결됨 (해당하는 경우)
   - [ ] 설정 파일이 작동함 (해당하는 경우)
3. **테스트 권장 사항**:
   - 스킬: 설명의 트리거 문구를 사용하여 질문을 던집니다.
   - 사용자가 호출하는 스킬: 다양한 인수로 `/plugin-name:skill-name`을 실행합니다.
   - 에이전트: 에이전트 예시와 일치하는 시나리오를 만듭니다.
   - 훅: 훅 실행을 보려면 `claude --debug`를 사용합니다.
   - MCP: 서버와 도구를 확인하려면 `/mcp`를 사용합니다.
4. **사용자에게 질문**: "테스트를 위해 플러그인을 준비했습니다. 각 컴포넌트의 테스트를 안내해 드릴까요, 아니면 직접 테스트해 보시겠습니까?"
5. **사용자가 안내를 원하는 경우**, 구체적인 테스트 케이스로 각 컴포넌트를 테스트하도록 안내합니다.

**산출물**: 테스트 및 작동이 확인된 플러그인

---

## Phase 8: Documentation & Next Steps

**목표**: 플러그인이 잘 문서화되고 배포될 준비가 되었는지 확인합니다.

**작업**:

1. **README 완전성 확인**:
   - README에 다음이 포함되어 있는지 확인합니다: 개요, 기능, 설치, 사전 요구 사항, 사용법
   - MCP 플러그인의 경우: 필요한 환경 변수를 문서화합니다.
   - 훅 플러그인의 경우: 훅 활성화를 설명합니다.
   - 설정의 경우: 구성 템플릿을 제공합니다.
2. **마켓플레이스 항목 추가** (게시하는 경우):
   - 사용자에게 marketplace.json에 추가하는 방법을 보여줍니다.
   - 마켓플레이스 설명을 작성하도록 돕습니다.
   - 카테고리와 태그를 제안합니다.
3. **요약 생성**:
   - 모든 할 일을 완료로 표시합니다.
   - 생성된 항목을 나열합니다:
     - 플러그인 이름 및 목적
     - 생성된 컴포넌트 (스킬 X개, 에이전트 Y개 등)
     - 주요 파일 및 목적
     - 전체 파일 수 및 구조
   - 다음 단계:
     - 테스트 권장 사항
     - 마켓플레이스 게시 (원하는 경우)
     - 사용량 기반 반복
4. **개선 사항 제안** (선택 사항):
   - 플러그인을 개선할 수 있는 추가 컴포넌트
   - 통합 기회
   - 테스트 전략

**산출물**: 사용 또는 게시 준비가 된 완전하게 문서화된 플러그인

---

## Important Notes

### Throughout All Phases

- **TodoWrite를 사용**하여 모든 단계에서 진행 상황을 추적합니다.
- 특정 컴포넌트 유형을 작업할 때 **Skill 도구로 스킬을 로드**합니다.
- **전용 에이전트를 사용**합니다 (agent-creator, plugin-validator, skill-reviewer).
- 핵심 결정 사항에서 **사용자의 확인을 요청**합니다.
- **plugin-dev 자체 패턴을 참조 예시로 준수**합니다.
- **모범 사례 적용**:
  - 스킬에 대해 3인칭 설명을 작성합니다.
  - 스킬 본문에는 명령형 문체를 사용합니다.
  - 스킬 지침은 Claude를 위해 작성합니다 (사용자에게 주는 것이 아님).
  - 강력한 트리거 문구를 설정합니다.
  - 이식성을 위해 ${CLAUDE_PLUGIN_ROOT}를 사용합니다.
  - 단계적 공개를 적용합니다.
  - 보안 우선 (HTTPS 사용, 자격 증명 하드코딩 금지).

### Key Decision Points (Wait for User)

1. After Phase 1: Confirm plugin purpose
2. After Phase 2: Approve component plan
3. After Phase 3: Proceed to implementation
4. After Phase 6: Fix issues or proceed
5. After Phase 7: Continue to documentation

### Skills to Load by Phase

- **Phase 2**: plugin-structure
- **Phase 5**: skill-development, agent-development, hook-development, mcp-integration, plugin-settings (필요에 따라); 레거시 `commands/` 레이아웃인 경우에만 command-development
- **Phase 6**: (에이전트가 스킬을 자동으로 사용함)

### Quality Standards

Every component must meet these standards:

- ✅ Follows plugin-dev's proven patterns
- ✅ Uses correct naming conventions
- ✅ Has strong trigger conditions (skills/agents)
- ✅ Includes working examples
- ✅ Properly documented
- ✅ Validated with utilities
- ✅ Tested in Claude Code

---

## Example Workflow

### User Request

"Create a plugin for managing database migrations"

### Phase 1: Discovery

- Understand: Migration management, database schema versioning
- Confirm: User wants to create, run, rollback migrations

### Phase 2: Component Planning

- Skills: 4 (migration best practices, create-migration, run-migrations, rollback)
- Agents: 1 (migration-validator)
- MCP: 1 (database connection)

### Phase 3: Clarifying Questions

- Which databases? (PostgreSQL, MySQL, etc.)
- Migration file format? (SQL, code-based?)
- Should agent validate before applying?
- What MCP tools needed? (query, execute, schema)

### Phase 4-8: Implementation, Validation, Testing, Documentation

---

**Begin with Phase 1: Discovery**
