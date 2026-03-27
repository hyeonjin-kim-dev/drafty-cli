# Drafty CLI

[English](README.md)

> 터미널에서 메모를 빠르게 캡처하고, 개인 Supabase 프로젝트와 동기화하는 CLI입니다.

[![npm version](https://img.shields.io/npm/v/drafty-cli)](https://www.npmjs.com/package/drafty-cli)
[![license](https://img.shields.io/npm/l/drafty-cli)](LICENSE)
[![node](https://img.shields.io/node/v/drafty-cli)](package.json)

## 주요 기능

- **설정 마법사** — `drafty login`으로 Supabase URL, anon key, project id를 사용자별 설정 파일에 저장합니다.
- **시스템 에디터 연동** — `$VISUAL`, `$EDITOR`, VS Code, Notepad, vim 중 사용 가능한 에디터를 엽니다.
- **태그 중심 캡처** — `drafty work idea`처럼 위치 인수로 태그를 바로 붙일 수 있습니다.
- **대화형 TTY 메뉴** — 목록 조회, 프리뷰, 태그 필터링, 본문 검색, 수정, 삭제를 방향키 기반 UI에서 처리합니다.
- **마크다운 동기화** — 현재 작업 디렉터리 아래의 모든 마크다운 파일을 읽기 전용 메모로 미러링합니다.
- **소프트 삭제** — 삭제된 노트는 보관 처리되며 `drafty show <id>`로 계속 볼 수 있습니다.
- **크로스 플랫폼** — Windows, macOS, Linux에서 동작합니다.

## 설치

```bash
npm install -g drafty-cli
```

Node.js 20 이상이 필요합니다.

## 빠른 시작

```bash
drafty login          # SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_PROJECT_ID 저장
drafty work idea      # 에디터를 열어 태그와 함께 메모 저장
drafty list           # TTY에서 메모를 대화형으로 탐색
drafty list todo idea # todo 또는 idea 태그가 있는 활성 메모 조회
drafty search meeting notes # 메모 본문에서 문구 검색
drafty sync           # 현재 작업 디렉터리 하위의 모든 마크다운 파일 동기화
drafty show <id>      # 보관된 메모까지 포함해 단일 메모 조회
drafty rm <id>        # 메모 보관 처리
drafty normalize-markdown --dry-run # 저장된 마크다운 정리 결과 미리보기
drafty update         # 최신 버전으로 업데이트
```

## 설정

Drafty는 다음 세 가지 Supabase 값을 사용합니다.

| 변수                  | 설명                                                          |
| --------------------- | ------------------------------------------------------------- |
| `SUPABASE_URL`        | Supabase 프로젝트 URL                                         |
| `SUPABASE_ANON_KEY`   | Supabase anon key                                             |
| `SUPABASE_PROJECT_ID` | 프로젝트 ref 값. `npm run db:types` 같은 저장소 도구에서 사용 |

이 값들은 `drafty login`으로 현재 Drafty가 읽는 사용자별 설정 파일에 저장할 수 있습니다.

Drafty는 아래 순서로 설정을 찾습니다.

1. 셸 환경 변수
2. 현재 작업 디렉터리의 `.env`
3. `drafty login`이 저장한 사용자별 설정 파일

사용자별 설정 파일 경로:

- Windows: `%APPDATA%\Drafty\.env`
- macOS / Linux: `~/.config/drafty/.env`

`drafty logout`은 저장된 사용자별 설정과, 과거 버전이 남긴 `session.json` 파일까지 함께 정리합니다.

## 명령어

| 명령어                      | 설명                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drafty [tags...]`          | 에디터를 열고 선택한 태그와 함께 새 메모를 저장                                                                                                                     |
| `drafty login`              | 설정 마법사를 실행하고 Supabase 정보를 저장                                                                                                                         |
| `drafty logout`             | 저장된 설정과 레거시 세션 파일을 제거                                                                                                                               |
| `drafty list [tags...]`     | 활성 메모를 조회. 태그 OR 필터 지원. TTY에서는 프리뷰, 컬러 태그, 상단 태그 필터, `s` 또는 `/` 본문 검색, `d` 또는 `Delete` 삭제 단축키 제공                        |
| `drafty search <query...>`  | 활성 메모 본문에서 문구를 검색. TTY에서는 결과를 다시 좁히고, 수정하거나 삭제까지 이어서 처리 가능                                                                  |
| `drafty sync`               | 현재 작업 디렉터리 하위의 모든 마크다운 파일을 Drafty의 읽기 전용 메모로 동기화. `--env <label>`로 환경 라벨을 덮어쓰고, `--dry-run`으로 변경 예정 사항만 확인 가능 |
| `drafty show <id>`          | 보관된 메모를 포함해 단일 메모 조회                                                                                                                                 |
| `drafty edit <id>`          | 메모 본문 또는 태그 수정                                                                                                                                            |
| `drafty rm [id]`            | id로 단일 메모 보관 또는 TTY에서 여러 메모 선택 보관                                                                                                                |
| `drafty normalize-markdown` | `\_`, `\[`, `\*`, `1\.` 같은 이스케이프된 마크다운 기호와 `&#x20;` 같은 HTML 엔티티를 정리. `--dry-run`으로 미리보기, `--yes`로 확인 생략 가능                      |
| `drafty update`             | 최신 npm 버전을 확인하고 업데이트. `--check`로 설치 없이 점검 가능                                                                                                  |

## 에디터 선택 순서

Drafty는 아래 순서로 사용 가능한 에디터를 찾습니다.

1. `$VISUAL`
2. `$EDITOR`
3. Windows에서는 `notepad`, macOS / Linux에서는 `vim`

예시:

```bash
export EDITOR="code --wait"
```

Windows PowerShell에서는:

```powershell
$env:EDITOR = "code --wait"
```

Windows에서 bash를 쓰고 있다면 현재 세션에는:

```bash
export EDITOR="code --wait"
```

앞으로 여는 터미널에도 계속 적용하려면:

```powershell
setx EDITOR "code --wait"
```

`setx`는 현재 열려 있는 PowerShell, bash, VS Code 터미널에는 즉시 반영되지 않습니다. 새 터미널을 열거나 VS Code를 다시 시작해야 적용됩니다.

`code` 명령이 `PATH`에 없다면, VS Code 설치 시 shell command를 PATH에 추가하거나 `EDITOR`를 `Code.exe`의 전체 경로와 `--wait`로 지정하세요.

## Supabase 설정

Drafty는 현재 단일 사용자 프로젝트 모델을 가정합니다. npm 패키지 자체가 데이터베이스 스키마를 생성하지는 않습니다. 새 Supabase 프로젝트는 이 저장소 기준으로 초기화하세요.

```bash
git clone https://github.com/hyeonjin-kim-dev/drafty-cli.git
cd drafty-cli
npm install
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push
npm run db:types
```

현재 스키마는 anon key 접근과 active/archived 라이프사이클을 사용하는 단일 `notes` 테이블 기반입니다.

## 마크다운 동기화

`drafty sync`는 현재 작업 디렉터리를 기준으로 재귀적으로 스캔해 하위의 모든 마크다운 파일을 Drafty에 읽기 전용 메모로 미러링합니다.

- 원본은 항상 현재 환경의 로컬 markdown 파일입니다.
- 다른 PC에서는 `drafty list`, `drafty show`로 동기화된 문서를 열람할 수 있습니다.
- Drafty 안에서 동기화 문서를 수정할 수는 없습니다. 로컬 파일을 수정한 뒤 `drafty sync`를 다시 실행해야 합니다.
- 현재 동기화 루트 아래에서 markdown 파일이 사라지면 다음 sync에서 해당 Drafty 메모는 archived 처리됩니다.
- list와 show에는 동기화된 문서의 환경 라벨과 원본 경로가 함께 표시됩니다.

## 문제 해결

**`Drafty is not configured`가 표시되나요?**

`drafty login`을 실행하거나, `SUPABASE_URL`과 `SUPABASE_ANON_KEY`를 셸 또는 로컬 `.env`에 제공하세요.

**`missing the latest Drafty schema`가 표시되나요?**

Supabase 프로젝트가 아직 이전 인증 스키마를 사용 중이거나, 저장소에 포함된 마이그레이션이 적용되지 않은 상태입니다. 이 저장소에서 `npm run db:push`를 실행한 뒤 다시 시도하세요.

**`Supabase rejected these credentials`가 표시되나요?**

`drafty login`을 다시 실행하고 저장한 URL과 anon key가 올바른지 확인하세요.

## 기여하기

개발 환경 구성, 프로젝트 구조, 규칙은 [CONTRIBUTING.ko.md](CONTRIBUTING.ko.md)를 참고하세요.

## 라이선스

[MIT](LICENSE)
