#!/usr/bin/env node
/**
 * ash — AgentSkillsHub CLI
 *
 * Discover, audit, and install open-source AI agent skills / MCP servers
 * without leaving the terminal. Searches a quality-filtered catalog of ~20K
 * skills (stars >= 5) that is downloaded once and cached locally, so every
 * search after the first is instant and offline — and puts ZERO load on the
 * Hub's backend (the index is a static file on the CDN).
 *
 * Commands:
 *   ash search <query> [filters]   find skills (local fuzzy ranking)
 *   ash audit  <owner/repo>        free basic trust check (security grade + flags)
 *   ash install <owner/repo>       install commands + "check before you install"
 *   ash update                     force-refresh the cached index
 *   ash --help
 *
 * Zero dependencies — Node >= 18 built-ins only (fetch, zlib, fs).
 */

import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.AGENTSKILLSHUB_BASE || "https://agentskillshub.top";
const META_URL = `${BASE}/search-index-meta.json`;
const INDEX_URL = `${BASE}/search-index.json.gz`;
const HUB_SKILL = (full) => `${BASE}/skill/${full}/`;

const CACHE_DIR = join(process.env.AGENTSKILLSHUB_CACHE || join(homedir(), ".cache", "agentskillshub"));
const CACHE_INDEX = join(CACHE_DIR, "search-index.json");
const CACHE_META = join(CACHE_DIR, "search-index-meta.json");
const TTL_MS = 8 * 60 * 60 * 1000; // refresh at most every 8h (matches sync cadence)

// security_grade → display
const GRADE = {
  safe: { label: "SAFE", mark: "🟢" },
  caution: { label: "CAUTION", mark: "🟡" },
  unsafe: { label: "UNSAFE", mark: "🔴" },
  reject: { label: "REJECT", mark: "⛔" },
  unknown: { label: "UNAUDITED", mark: "⚪" },
};

// CJK detection — Chinese queries have no word boundaries, so we bigram them.
const CJK = /[一-鿿]/;

// Generic terms that appear in ~half the catalog — they drown the distinctive
// part of a query. Ignored during scoring unless the whole query is generic.
const STOPWORDS = new Set([
  "ai", "mcp", "mcps", "agent", "agents", "tool", "tools", "skill", "skills",
  "server", "servers", "app", "apps", "工具", "服务器", "服务",
]);

// ─── tiny ANSI (auto-off when not a TTY / NO_COLOR) ──────────────────────────
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c("1", s);
const dim = (s) => c("2", s);
const cyan = (s) => c("36", s);
const green = (s) => c("32", s);
const yellow = (s) => c("33", s);

// ─── cache / index loading ───────────────────────────────────────────────────
async function fetchJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "ash-cli" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

function readCachedIndex() {
  if (!existsSync(CACHE_INDEX)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_INDEX, "utf8"));
  } catch {
    return null;
  }
}

function cacheFresh() {
  if (!existsSync(CACHE_INDEX)) return false;
  return Date.now() - statSync(CACHE_INDEX).mtimeMs < TTL_MS;
}

async function downloadIndex() {
  process.stderr.write(dim("⏬ downloading skill index…\n"));
  const res = await fetch(INDEX_URL, { headers: { "user-agent": "ash-cli" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching index`);
  const buf = Buffer.from(await res.arrayBuffer());
  const json = gunzipSync(buf).toString("utf8");
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_INDEX, json);
  const parsed = JSON.parse(json);
  writeFileSync(CACHE_META, JSON.stringify({ v: parsed.v, generated_at: parsed.generated_at, count: parsed.count, min_stars: parsed.min_stars }));
  process.stderr.write(dim(`✓ cached ${parsed.count} skills (${(buf.length / 1024 / 1024).toFixed(1)}MB)\n`));
  return parsed;
}

/** Load index, refreshing if stale or if the CDN has a newer generation. */
async function loadIndex({ force = false } = {}) {
  if (!force && cacheFresh()) {
    const cached = readCachedIndex();
    if (cached) return cached;
  }
  // Cheap freshness probe (77B) before pulling the full 1.7MB index.
  if (!force && existsSync(CACHE_META) && existsSync(CACHE_INDEX)) {
    try {
      const [remote, local] = [await fetchJson(META_URL), JSON.parse(readFileSync(CACHE_META, "utf8"))];
      if (remote.generated_at === local.generated_at) {
        writeFileSync(CACHE_INDEX, readFileSync(CACHE_INDEX)); // bump mtime → reset TTL
        return readCachedIndex();
      }
    } catch {
      const cached = readCachedIndex();
      if (cached) return cached; // offline → serve stale rather than fail
    }
  }
  try {
    return await downloadIndex();
  } catch (err) {
    const cached = readCachedIndex();
    if (cached) {
      process.stderr.write(yellow(`⚠ refresh failed (${err.message}); using cached index\n`));
      return cached;
    }
    throw err;
  }
}

// ─── search ──────────────────────────────────────────────────────────────────
function parseFilters(args) {
  const f = { limit: 10, json: false, minStars: 0, safe: false, category: null, platform: null };
  const terms = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") f.json = true;
    else if (a === "--safe" || a === "--safe-only") f.safe = true;
    else if (a === "--limit") f.limit = Math.max(1, parseInt(args[++i], 10) || 10);
    else if (a === "--min-stars") f.minStars = parseInt(args[++i], 10) || 0;
    else if (a === "--category") f.category = (args[++i] || "").toLowerCase();
    else if (a === "--platform") f.platform = (args[++i] || "").toLowerCase();
    else if (a.startsWith("--")) {} // ignore unknown flags
    else terms.push(a);
  }
  f.query = terms.join(" ").trim();
  return f;
}

/** Score one skill row against the tokenized query. Higher = better match. */
function scoreRow(row, tokens) {
  if (!tokens.length) return row.q || 0; // no query → quality-ranked browse
  const name = (row.n || "").toLowerCase();
  const full = (row.f || "").toLowerCase();
  const desc = (row.d || "").toLowerCase();
  const tags = (row.t || []).join(" ").toLowerCase();
  // Bilingual scenario keywords (field `w`) — lets Chinese queries match
  // English-only repos via our curated scenario titles, and ranks
  // scenario-relevant skills higher. Empty/undefined on older indexes.
  const scen = (row.w || "").toLowerCase();
  // When the query has a distinctive term, generic tokens (ai/mcp/agent/工具…)
  // match half the catalog and drown it — "去 AI 味" would rank vercel/ai over
  // the actual humanizer. Skip generic tokens for scoring UNLESS the whole query
  // is generic (then they're all we have).
  const hasContent = tokens.some((t) => !STOPWORDS.has(t));
  let score = 0;
  for (const tok of tokens) {
    if (hasContent && STOPWORDS.has(tok)) continue;
    if (name === tok) score += 50;
    else if (name.includes(tok)) score += 20;
    if (full.includes(tok)) score += 8;
    if (scen.includes(tok)) score += 12;
    if (tags.includes(tok)) score += 10;
    if (desc.includes(tok)) score += 5;
    // CJK compound queries arrive as one space-less token ("抓取网站").
    // Fall back to 2-char windows so a keyword like "抓取" still matches.
    if (CJK.test(tok) && tok.length >= 3) {
      for (let i = 0; i + 2 <= tok.length; i++) {
        const bg = tok.slice(i, i + 2);
        if (scen.includes(bg)) { score += 9; break; }
      }
    }
  }
  if (score === 0) return -1; // matched nothing
  return score + (row.q || 0) / 20 + Math.min(row.s, 50000) / 25000; // quality + popularity tiebreak
}

function applyFilters(skills, f) {
  return skills.filter((r) => {
    if (f.minStars && (r.s || 0) < f.minStars) return false;
    if (f.safe && !(r.g === "safe")) return false;
    if (f.category && (r.c || "").toLowerCase() !== f.category) return false;
    if (f.platform && !(r.p || []).map((p) => p.toLowerCase()).includes(f.platform)) return false;
    return true;
  });
}

/** Tokenize a query. Splits on whitespace AND at latin↔CJK boundaries, so a
 *  glued mixed query like "ppt制作" becomes ["ppt", "制作"] (otherwise it's one
 *  token that matches nothing). Pure-CJK compounds still rely on the bigram
 *  fallback in scoreRow. */
function tokenize(q) {
  return q
    .toLowerCase()
    .replace(/([a-z0-9])([一-鿿])/g, "$1 $2")
    .replace(/([一-鿿])([a-z0-9])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}

function runSearch(index, args) {
  const f = parseFilters(args);
  const tokens = tokenize(f.query);
  const pool = applyFilters(index.skills, f);
  const ranked = pool
    .map((r) => ({ r, score: scoreRow(r, tokens) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, f.limit)
    .map((x) => x.r);

  if (f.json) {
    console.log(JSON.stringify(ranked.map(expand), null, 2));
    return;
  }
  if (!ranked.length) {
    console.log(dim(`No skills matched "${f.query}".`) + " Try fewer/broader terms or drop --safe / --category.");
    return;
  }
  console.log(bold(`\n${ranked.length} result${ranked.length > 1 ? "s" : ""}`) + dim(`  ·  catalog ${index.count} skills, generated ${index.generated_at.slice(0, 10)}\n`));
  ranked.forEach(printResult);
  console.log(dim(`\nNext:  ash audit <owner/repo>   ·   ash install <owner/repo>\n`));
}

// ─── display helpers ─────────────────────────────────────────────────────────
function gradeBadge(g) {
  const meta = GRADE[g] || GRADE.unknown;
  return `${meta.mark} ${meta.label}`;
}

/** estimated_tokens is noisy upstream (some rows hold whole-repo counts).
 *  Only surface it when plausibly a context cost. */
function tokenHint(k) {
  if (!k || k <= 0 || k > 200000) return "";
  return dim(`  ~${k >= 1000 ? (k / 1000).toFixed(1) + "k" : k} tok`);
}

function starStr(s) {
  return s >= 1000 ? `${(s / 1000).toFixed(1)}k★` : `${s}★`;
}

function printResult(r) {
  const head = `${bold(cyan(r.f))}  ${yellow(starStr(r.s))}  ${gradeBadge(r.g)}`;
  console.log(head + tokenHint(r.k) + (r.o ? green("  ✓ official") : ""));
  if (r.d) console.log(`  ${r.d}`);
  const meta = [r.c, ...(r.p || [])].filter(Boolean).join(" · ");
  console.log(dim(`  ${meta}   ${HUB_SKILL(r.f)}`) + "\n");
}

function expand(r) {
  return {
    repo_full_name: r.f, name: r.n, author: r.a, stars: r.s, description: r.d,
    category: r.c, platforms: r.p, tags: r.t, quality_score: r.q,
    security_grade: r.g, estimated_tokens: r.k, official: !!r.o, hub_url: HUB_SKILL(r.f),
  };
}

// ─── audit (free basic tier) ─────────────────────────────────────────────────
const VERDICT = {
  safe: "Reviewed, no blocking issues — reasonable for general use. Still confirm credential handling for production.",
  caution: "Has caution flags — fine for personal trials; review credentials/maintainer before brand or production use.",
  unsafe: "Flagged unsafe — do NOT run against real credentials or production data.",
  reject: "Rejected — known serious problems. Avoid.",
  unknown: "Never audited by anyone. It's a black box: check the code, what credentials it asks for, and who maintains it before you trust it.",
};

function runAudit(index, args) {
  const json = args.includes("--json");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) return fail('audit needs a target, e.g. `ash audit owner/repo`');
  const row = index.skills.find((r) => r.f.toLowerCase() === target.toLowerCase());
  if (!row) {
    const msg = `"${target}" is not in the quality catalog (stars < 5, or not indexed).`;
    if (json) return console.log(JSON.stringify({ target, in_catalog: false, note: msg + " Deep audit of any GitHub URL is a Pro feature." }, null, 2));
    console.log(`\n${yellow("Not in the free catalog.")} ${msg}`);
    console.log(dim(`Deep audit of any GitHub URL (incl. <5★ / private) is a Pro feature → ${BASE}/enterprise/\n`));
    return;
  }
  if (json) {
    return console.log(JSON.stringify({ ...expand(row), in_catalog: true, verdict: VERDICT[row.g] || VERDICT.unknown, tier_note: "Basic (free). 5-dimension deep audit + any GitHub URL → Pro." }, null, 2));
  }
  console.log(`\n${bold(cyan(row.f))}  ${yellow(starStr(row.s))}${row.o ? green("  ✓ official") : ""}`);
  console.log(`Security: ${gradeBadge(row.g)}     Quality: ${Math.round(row.q ?? 0)}/100`);
  if (row.d) console.log(dim(`\n  ${row.d}`));
  console.log(`\n${bold("Basic verdict")} ${dim("(free tier)")}`);
  console.log(`  ${VERDICT[row.g] || VERDICT.unknown}`);
  console.log(dim(`\n  Full 5-dimension audit (code · credentials · vendor · supply-chain · operational)`));
  console.log(dim(`  + any GitHub URL → ${BASE}/enterprise/`));
  console.log(dim(`  Report page: ${HUB_SKILL(row.f)}#audit\n`));
}

// ─── install ─────────────────────────────────────────────────────────────────
function installCommands(full) {
  return {
    "claude-code": `npx skills add ${full}`,
    cursor: `npx skills add ${full}`,
    manual: `git clone https://github.com/${full}.git`,
  };
}

function runInstall(index, args) {
  const json = args.includes("--json");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) return fail('install needs a target, e.g. `ash install owner/repo`');
  const row = index.skills.find((r) => r.f.toLowerCase() === target.toLowerCase());
  const cmds = installCommands(target);
  if (json) {
    return console.log(JSON.stringify({ repo_full_name: target, in_catalog: !!row, install_commands: cmds, pre_install_safety: row ? { security_grade: row.g, must_check: ["What credentials does it ask for, and where are they stored?", "Is the maintainer identifiable / the repo actively maintained?"] } : null, hub_url: HUB_SKILL(target) }, null, 2));
  }
  console.log(`\n${bold("Install ")}${cyan(target)}`);
  console.log(`  ${green(cmds["claude-code"])}   ${dim("# Claude Code / Cursor")}`);
  console.log(dim(`  ${cmds.manual}   # manual\n`));
  if (row) {
    console.log(`${bold("Before you install")}  ${gradeBadge(row.g)}`);
    if (row.g === "unknown") console.log(`  ${yellow("Unaudited.")} Check the code, the credentials it requests, and who maintains it.`);
    else console.log(`  ${VERDICT[row.g]}`);
  } else {
    console.log(dim("Not in the quality catalog — audit it yourself before trusting it."));
  }
  console.log(dim(`\n  Details: ${HUB_SKILL(target)}\n`));
}

// ─── plumbing ────────────────────────────────────────────────────────────────
function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

const HELP = `${bold("ash")} — AgentSkillsHub CLI  ${dim("· search · audit · install · ~20K skills")}

${bold("Usage")}
  ash search <query> [--category <c>] [--platform <p>] [--min-stars <n>] [--safe] [--limit <n>] [--json]
  ash audit  <owner/repo> [--json]
  ash install <owner/repo> [--json]
  ash update                      force-refresh the cached index
  ash --help

${bold("Examples")}
  ash search "scrape a website" --safe
  ash search postgres --category mcp-server --limit 5
  ash audit modelcontextprotocol/servers
  ash install owner/repo

${dim("Index is a static CDN file, downloaded once and cached at")} ${CACHE_DIR}
${dim("Refreshes every 8h. Zero backend load.  Set NO_COLOR=1 to disable color.")}`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") return console.log(HELP);

  if (cmd === "update") {
    await loadIndex({ force: true });
    return console.log(green("✓ index refreshed."));
  }
  const index = await loadIndex();
  if (cmd === "search" || cmd === "s") return runSearch(index, rest);
  if (cmd === "audit" || cmd === "a") return runAudit(index, rest);
  if (cmd === "install" || cmd === "i") return runInstall(index, rest);

  // bare `ash <query>` → treat as search
  runSearch(index, [cmd, ...rest]);
}

main().catch((err) => fail(err.message || String(err)));
