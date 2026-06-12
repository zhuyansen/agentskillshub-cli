# `ash` — AgentSkillsHub CLI

Search, audit, and install open-source AI agent skills & MCP servers from your terminal. Every result is **security-graded** and **quality-scored** by [AgentSkillsHub](https://agentskillshub.top).

```bash
npx @agentskillshub/cli search "scrape a website" --safe
```

## Why

Discovering a skill is easy. Knowing whether it's safe to run against your credentials is not. `ash` puts the trust signal *before* the install:

```
$ ash search postgres --category mcp-server --limit 2

call518/MCP-PostgreSQL-Ops  150★  🟢 SAFE
  Give AI assistants full PostgreSQL DBA superpowers — 30+ tools…
  mcp-server · claude-code · mcp · python   https://agentskillshub.top/skill/call518/MCP-PostgreSQL-Ops/

sgaunet/postgresql-mcp  5★  ⚪ UNAUDITED  ~23.0k tok
  A Model Context Protocol (MCP) server… read-only query execution…
  mcp-server · claude-code · go · mcp   https://agentskillshub.top/skill/sgaunet/postgresql-mcp/
```

## Commands

| | |
|---|---|
| `ash search <query> [filters]` | Find skills. Filters: `--category` `--platform` `--min-stars` `--safe` `--limit` |
| `ash audit <owner/repo>` | Free basic trust check: security grade + plain-English verdict |
| `ash install <owner/repo>` | Install commands + "check before you install" safety line |
| `ash update` | Force-refresh the cached index |

Add `--json` to any of `search` / `audit` / `install` for machine-readable output.

## How it works

The catalog (~20K quality skills, stars ≥ 5) is a single static file (~1.7MB gzipped) served from the CDN. `ash` downloads it once, caches it at `~/.cache/agentskillshub/`, and refreshes every ~8h. **All searching is local** — fast, works offline, and puts zero load on the backend.

## Security grades

🟢 SAFE · 🟡 CAUTION · 🔴 UNSAFE · ⛔ REJECT · ⚪ UNAUDITED

⚪ **UNAUDITED** is not "probably fine" — it means *no one has audited it*. Check the code, the credentials it asks for, and who maintains it before you trust it.

## Free vs. Pro

- **Free**: search · basic audit · install commands, for any catalogued skill.
- **Pro / Enterprise**: 5-dimension deep audit, any GitHub URL (incl. <5★ / private), CI/batch auditing, compliance evidence → <https://agentskillshub.top/enterprise/>

## Env

| Var | Default |
|---|---|
| `AGENTSKILLSHUB_BASE` | `https://agentskillshub.top` |
| `AGENTSKILLSHUB_CACHE` | `~/.cache/agentskillshub` |
| `NO_COLOR` | unset (set to disable color) |

MIT © AgentSkillsHub
