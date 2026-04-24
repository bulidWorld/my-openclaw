# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

OpenClaw is a personal AI assistant that runs on your own devices and connects to multiple messaging channels (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, etc.). It consists of a local Gateway (control plane), CLI, companion apps (macOS, iOS, Android), and an extensible plugin system.

- **Repo:** https://github.com/openclaw/openclaw
- **Docs:** https://docs.openclaw.ai
- **Discord:** https://discord.gg/clawd

## Project Structure

```
openclaw/
├── src/                 # Core source (CLI, gateway, media, infra, channels)
├── extensions/          # Plugin/extensions workspace packages
├── apps/                # Companion apps (macOS, iOS, Android)
├── docs/                # Mintlify docs (docs.openclaw.ai)
├── .agents/             # Agent skills and workflows
├── .github/             # CI workflows, templates, labeler config
├── scripts/             # Build, test, and release scripts
├── dist/                # Built output
└── ui/                  # Control UI (Lit-based web frontend)
```


## 新增调试日志，代码写法：
详细用法见 [DEBUG_LOGS_GUIDE.md](./DEBUG_LOGS_GUIDE.md)。

**Import boundaries:**
- Extension code should only import from `openclaw/plugin-sdk/*` and local `api.ts`/`runtime-api.ts` barrels
- Never import core `src/**`, `src/plugin-sdk-internal/**`, or another extension's `src/**` directly from extensions
- Keep plugin IDs aligned: `openclaw.plugin.json:id` = `extensions/<id>` = package name (`@openclaw/<id>`)

## Build, Test, and Development Commands

**Runtime:** Node 22+ (Node 24 recommended). pnpm is the primary package manager; bun is supported for running TypeScript directly.

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Type check
pnpm tsgo

# Lint and format
pnpm check           # Full check (format, lint, type, build checks)
pnpm format          # Format with oxfmt
pnpm format:fix      # Fix formatting
pnpm lint            # Oxlint

# Test
pnpm test                        # Full test suite (vitest, forks mode)
pnpm test -- <path> -t <filter>  # Targeted test run
pnpm test:coverage               # With coverage
pnpm test:gateway                # Gateway-specific tests
pnpm test:contracts              # Contract tests (channels + plugins)
pnpm test:live                   # Live tests with real API keys
pnpm test:docker:all             # Full Docker E2E suite

# Run CLI in dev
pnpm openclaw <command>
pnpm dev                         # Dev mode
pnpm gateway:watch               # Auto-reload gateway on changes

# macOS packaging
scripts/package-mac-app.sh
```

**Pre-commit:** `prek install` (runs same checks as CI)

**Landing bar for `main`:** `pnpm check` and `pnpm test` should pass. If the change affects build output or module boundaries, `pnpm build` MUST pass before pushing.

## Testing Guidelines

- **Framework:** Vitest with V8 coverage (70% thresholds)
- **File naming:** `*.test.ts` colocated with source; e2e in `*.e2e.test.ts`
- **Worker mode:** Keep Vitest on `forks` only. Do not exceed 16 workers.
- **Memory pressure:** Use `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test`
- **Test cleanup:** Write tests to clean up timers, env, globals, mocks, sockets, temp dirs, and module state
- **Model constants:** Use `sonnet-4.6` and `gpt-5.4` for example Anthropic/OpenAI model constants

## Coding Style

- **Language:** TypeScript (ESM). Prefer strict typing; avoid `any`.
- **Formatting:** Oxlint and Oxfmt. Never add `@ts-nocheck` or disable `no-explicit-any`.
- **Dynamic imports:** Do not mix `await import("x")` and static imports for the same module in production code. Create `*.runtime.ts` boundaries for lazy loading.
- **File size:** Aim for ~500-700 LOC; split/refactor when it improves clarity.
- **Comments:** Add brief comments for tricky or non-obvious logic.
- **Naming:** Use **OpenClaw** for product/app/docs; use `openclaw` for CLI, package, paths, config keys.
- **Written English:** American spelling and grammar in code, comments, docs, and UI strings.

## Extension SDK Guardrails

1. **Self-import guardrail:** Inside an extension package, do not import via `openclaw/plugin-sdk/<extension>` from production files. Route through local `./api.ts` or `./runtime-api.ts` barrels.

2. **Package boundary:** Inside `extensions/<id>/**`, do not use relative imports that resolve outside that package root. Import `openclaw/plugin-sdk/<subpath>` for shared code.

3. **No prototype mutation:** Never share class behavior via prototype mutation (`applyPrototypeMixins`, `Object.defineProperty` on `.prototype`). Use explicit inheritance/composition.

## Commit & Pull Request Guidelines

**Commit messages:**
- Create commits with `scripts/committer "<msg>" <file...>` to scope staging
- Concise, action-oriented (e.g., `CLI: add verbose flag to send`)
- Group related changes; avoid bundling unrelated refactors

**PR submission:**
- Template: `.github/pull_request_template.md`
- One thing per PR; do not mix unrelated concerns
- Include screenshots for UI/visual changes
- For AI-assisted PRs: mark as AI-assisted, note testing degree, include prompts/session logs if possible
- Do not submit refactor-only PRs unless explicitly requested
- Do not submit test-only fixes for known `main` failures (report as issues instead)

**Git:**
- Do not create merge commits on `main`. Rebase onto latest `origin/main` before pushing.
- If `git branch -d` is policy-blocked, use `git update-ref -d refs/heads/<branch>`

## Docs and i18n

**Docs linking:**
- Hosted on Mintlify (docs.openclaw.ai)
- Internal links: root-relative, no `.md`/`.mdx` extension (e.g., `[Config](/configuration)`)
- Cross-references: use anchors (e.g., `[Hooks](/configuration#hooks)`)
- Avoid em dashes and apostrophes in headings (breaks Mintlify anchors)
- When user asks for links, use full `https://docs.openclaw.ai/...` URLs

**i18n (zh-CN):**
- `docs/zh-CN/**` is generated; do not edit unless explicitly asked
- Pipeline: update English docs → adjust glossary (`docs/.i18n/glossary.zh-CN.json`) → run `scripts/docs-i18n`
- `pnpm docs:check-i18n-glossary` enforces glossary coverage

## Release and Advisory Workflows

- **Release maintainer skill:** `$openclaw-release-maintainer` at `.agents/skills/openclaw-release-maintainer/SKILL.md`
- **GHSA advisory skill:** `$openclaw-ghsa-maintainer` at `.agents/skills/openclaw-ghsa-maintainer/SKILL.md`
- **PR maintainer skill:** `$openclaw-pr-maintainer` at `.agents/skills/openclaw-pr-maintainer/SKILL.md`

Release/publish actions require explicit approval even when using skills.

## Security and Configuration

- **Credentials:** Web provider stores creds at `~/.openclaw/credentials/`; Pi sessions at `~/.openclaw/sessions/`
- **DM security:** Default `dmPolicy="pairing"` for unknown senders on Telegram/WhatsApp/Signal/iMessage/Discord/Slack. Approve with `openclaw pairing approve <channel> <code>`.
- **Never commit:** Real phone numbers, videos, live config values, or secrets. Use fake placeholders.
- **Patched dependencies:** Any dependency with `pnpm.patchedDependencies` must use exact version (no `^`/`~`).
- **LDAP Authentication:** LDAP config lives in `~/.openclaw/ldap.config` (see `docs/ldap.config.example`). Use `openclaw ldap login` to authenticate. Session isolation per user is supported via `session.isolatedSessions` config option.

## Multi-Agent Safety

- Do **not** create/apply/drop `git stash` entries unless explicitly requested
- Do **not** create/remove/modify `git worktree` checkouts unless explicitly requested
- Do **not** switch branches unless explicitly requested
- When user says "push", you may `git pull --rebase` to integrate latest changes
- When user says "commit", scope to your changes only
- Running multiple agents is OK as long as each has its own session

## Platform Notes

**macOS:**
- Gateway runs as menubar app (no separate LaunchAgent). Restart via OpenClaw app or `scripts/restart-mac.sh`.
- Logs: `./scripts/clawlog.sh` (unified logs, expects passwordless sudo)
- Do not rebuild macOS app over SSH; rebuilds must run directly on the Mac.

**iOS/Android:**
- Before testing, check for connected real devices before using simulators/emulators.
- "Restart app" means rebuild (recompile/install) and relaunch.

**Version locations:**
- `package.json` (CLI)
- `apps/android/app/build.gradle.kts` (versionName/versionCode)
- `apps/ios/Sources/Info.plist` (CFBundleShortVersionString/CFBundleVersion)
- `apps/macos/Sources/OpenClaw/Resources/Info.plist` (CFBundleShortVersionString/CFBundleVersion)
- `docs/install/updating.md` (pinned npm version)

**Vocabulary:** "makeup" = "mac app"

## Tool Schema Guardrails

- Avoid `Type.Union` in tool input schemas; no `anyOf`/`oneOf`/`allOf`
- Use `stringEnum`/`optionalStringEnum` (Type.Unsafe enum) for string lists
- Use `Type.Optional(...)` instead of `... | null`
- Keep top-level tool schema as `type: "object"` with `properties`
- Avoid raw `format` property names (some validators treat as reserved)

## Collaboration Notes

- Print full GitHub Issue/PR URLs at end of tasks
- Never update the Carbon dependency
- For manual `openclaw message send` messages with `!`, use heredoc pattern to avoid Bash escaping
- When answering questions, verify in code; do not guess
- Bug investigations: read source of relevant npm deps and local code before concluding
