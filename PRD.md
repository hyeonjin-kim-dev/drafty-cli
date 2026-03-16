# Drafty PRD

## 1. 제품 정의

Drafty는 터미널에서 개인 메모를 빠르게 작성하고, 사용자가 직접 소유한 Supabase 프로젝트에 저장하는 CLI 앱이다.

핵심 정의:

> `drafty [태그...]`를 실행하면 시스템 에디터가 열리고, 저장한 메모가 사용자의 단일 Supabase 프로젝트에 기록된다.

## 2. 현재 목표

1. 터미널에서 빠르게 메모를 작성할 수 있어야 한다.
2. 브라우저나 이메일 인증 없이, 로컬 설정만으로 바로 메모를 저장할 수 있어야 한다.
3. 메모는 태그와 상태값을 포함한 구조화된 형태로 저장되어야 한다.
4. CLI 사용성이 단순하고 예측 가능해야 한다.

## 3. 비목표

- 협업 기능
- 공유 링크
- 파일 첨부
- 의미 검색과 벡터 검색
- 웹 UI
- 다중 사용자 인증 흐름
- 브라우저 리다이렉트 기반 로그인

## 4. 핵심 사용자 경험

### 4.1 초기 설정

```bash
drafty login
```

동작:

1. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_ID`를 묻는다.
2. 입력값의 빈값과 형식을 검증한다.
3. `notes` 테이블 접근 가능 여부를 확인한다.
4. 설정을 per-user `.env`에 저장한다.

`login`은 더 이상 인증 명령이 아니라 설정 마법사다.

### 4.2 메모 작성

```bash
drafty work idea
```

동작:

1. 태그를 파싱한다.
2. 설정이 없으면 `drafty login`을 안내한다.
3. 시스템 에디터를 연다.
4. 사용자가 메모를 작성하고 저장 후 종료한다.
5. 본문, 태그, 상태를 `notes` 테이블에 저장한다.

### 4.3 메모 조회와 편집

- `drafty list [tags...]`: active 메모 목록 조회. 태그를 넘기면 OR 조건으로 필터링. TTY에서는 편집 진입용 picker 제공
- `drafty show <id>`: 단일 메모 조회. archived 메모도 조회 가능
- `drafty edit <id>`: 본문 또는 태그 편집
- `drafty rm [id]`: soft delete. `status = 'archived'`로 전환

### 4.4 설정 제거

```bash
drafty logout
```

동작:

- 저장된 per-user 설정 파일을 삭제한다.
- 과거 버전의 `session.json`이 남아 있으면 함께 정리한다.

## 5. 명령 표면

지원 명령:

- `drafty [tags...]`
- `drafty login`
- `drafty logout`
- `drafty list [tags...]`
- `drafty show <id>`
- `drafty edit <id>`
- `drafty rm [id]`

## 6. 데이터 모델

현재 메모 저장 모델은 단일 사용자 프로젝트 기준이다.

`public.notes` 컬럼:

- `id`
- `body`
- `cli_tags`
- `status`
- `created_at`
- `updated_at`

의도:

- anon key로 `select`, `insert`, `update`가 가능해야 한다.
- 삭제는 hard delete가 아니라 archived 상태 전환으로 처리한다.
- 목록은 active 메모만 기본 노출하고, 태그 인자가 있으면 해당 태그들 중 하나라도 포함한 메모만 노출한다.

## 7. 운영 가정

- 사용자는 자신이 소유한 Supabase 프로젝트를 준비한다.
- 저장소의 migration이 스키마의 source of truth다.
- npm 패키지는 스키마를 자동 생성하지 않는다.
- `SUPABASE_PROJECT_ID`는 개발용 타입 재생성 스크립트에서 사용한다.

## 8. 기술 선택

- Runtime: Node.js
- Language: TypeScript
- CLI: Commander
- Backend: Supabase Postgres + `@supabase/supabase-js`
- Editor execution: Node.js 표준 라이브러리 기반 외부 에디터 실행

## 9. 성공 기준

1. `drafty login`이 설정을 저장하고 잘못된 프로젝트를 조기에 감지한다.
2. 설정만 있으면 capture, list, show, edit, rm이 동작한다.
3. 오래된 세션 파일이 남아 있어도 새 흐름을 방해하지 않는다.
4. 문서와 CLI help가 현재 설정 기반 동작과 일치한다.
