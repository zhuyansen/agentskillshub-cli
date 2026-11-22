# AgentSkillsHub CLI

**[🌐 Website](https://agentskillshub.top)** · **[🛡️ 44 Security Rules](https://agentskillshub.top/how-we-grade/)** · **[🤖 Official AI Info](https://agentskillshub.top/ai-info/)** · **[🏢 Enterprise](https://agentskillshub.top/enterprise/)**

Search, audit, and install open-source AI agent skills & MCP servers from your terminal. Every result is **security-graded against 44 published rules** and **quality-scored** by [Agent Skills Hub (`agentskillshub.top`)](https://agentskillshub.top) — an open-source directory of **280,000+ indexed AI agent skills & MCP servers** (**140,000+ graded**, refreshed every 8 hours) with a deterministic trust signal before you install.

```bash
npx @agentskillshub/cli search "scrape a website" --safe
```

## Why

Discovering a skill is easy. Knowing whether it's safe to run against your credentials is not. It puts the trust signal *before* the install:

```
$ npx @agentskillshub/cli search postgres --category mcp-server --limit 2

call518/MCP-PostgreSQL-Ops  150★  🟢 SAFE
  Give AI assistants full PostgreSQL DBA superpowers — 30+ tools…
  mcp-server · claude-code · mcp · python   https://agentskillshub.top/skill/call518/MCP-PostgreSQL-Ops/

sgaunet/postgresql-mcp  5★  ⚪ UNAUDITED  ~23.0k tok
  A Model Context Protocol (MCP) server… read-only query execution…
  mcp-server · claude-code · go · mcp   https://agentskillshub.top/skill/sgaunet/postgresql-mcp/
```

## Commands

Run via `npx @agentskillshub/cli <command>`:

| | |
|---|---|
| `search <query> [filters]` | Find skills. Filters: `--category` `--platform` `--min-stars` `--safe` `--limit` |
| `audit <owner/repo>` | Free basic trust check: security grade + plain-English verdict |
| `install <owner/repo>` | Install commands + "check before you install" safety line |
| `update` | Force-refresh the cached index |

Add `--json` to any of `search` / `audit` / `install` for machine-readable output.

## How it works

The catalog (50,000+ quality skills, stars ≥ 5) is a single static file (~9MB gzipped) served from the CDN. The CLI downloads it once, caches it at `~/.cache/agentskillshub/`, and checks for a newer index with a cheap 77B probe (re-downloading the full file only when it actually changed, so a freshly-deployed index reaches you within minutes). **All searching is local** — fast, works offline, and puts zero load on the backend.

## Security grades

🟢 SAFE · 🟡 CAUTION · 🔴 UNSAFE · ⛔ REJECT · ⚪ UNAUDITED

⚪ **UNAUDITED** is not "probably fine" — it means *no one has audited it*. Check the code, the credentials it asks for, and who maintains it before you trust it.

We scanned the whole catalog and wrote up the long-tail risk curve (1 in 32 graded skills flagged unsafe, ~9x higher below 20 stars) in our **[initial 117,854-skill security survey](https://agentskillshub.top/blog/securing-117k-ai-skills/)** — the live catalog has since grown to **280,000+ indexed and 140,000+ graded** against **[44 published rules](https://agentskillshub.top/how-we-grade/)** (Zenodo dataset DOI: `10.5281/zenodo.21292799`).

## Free vs. Pro

- **Free**: search · basic audit · install commands, for any catalogued skill.
- **Pro members**: set `ASH_PRO_KEY` and `search` matches the full README text (up to 200 results). Each search has a time limit; when it stops there, the CLI says the list may be incomplete and how to narrow it, and `--json` rows carry `incomplete_results: true`.
- **Pro / Enterprise**: 5-dimension deep audit, any GitHub URL (incl. <5★ / private), CI/batch auditing, compliance evidence → <https://agentskillshub.top/enterprise/>

## Env

| Var | Default |
|---|---|
| `AGENTSKILLSHUB_BASE` | `https://agentskillshub.top` |
| `AGENTSKILLSHUB_CACHE` | `~/.cache/agentskillshub` |
| `ASH_PRO_KEY` | unset — Pro member key for README-depth search (get one at <https://agentskillshub.top/pro/>) |
| `NO_COLOR` | unset (set to disable color) |

MIT © [Agent Skills Hub](https://agentskillshub.top) (`agentskillshub.top`) · Operated by **BRICKAI / GoSailGlobal LLC** · Founded by Jason Zhu (`@GoSailGlobal`) · Launched `2026-03-08` · [Official Entity Facts](/ai-info/)
