#!/usr/bin/env node
// Deterministic steps of a rev-mode review, ported from RevEngine's src/findings.ts
// and action/comments.ts. `merge` turns seat files into numbered candidates with
// repeats merged; `final` applies the verifier's verdicts, ranks, and prints the review.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };
const KINDS = ["defect", "test", "documentation", "maintainability"];
const NEARBY_LINES = 3;
const DUPLICATE_SIMILARITY = 0.45;

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function normalize(raw, seat, repo) {
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const file = typeof item?.file === "string" ? item.file.replace(/^\.?\//, "") : "";
    const path = join(repo, file);
    if (!file || !existsSync(path)) {
      console.error(`${seat}: dropped a finding that cites no readable file at head (${file || "no file"})`);
      continue;
    }
    const lineCount = readFileSync(path, "utf8").split("\n").length;
    const start = Math.min(Math.max(1, Number.parseInt(item.start_line, 10) || 1), lineCount);
    const end = Math.min(Math.max(Number.parseInt(item.end_line, 10) || start, start), lineCount);
    const kind = KINDS.includes(item.kind) ? item.kind : "defect";
    let severity = item.severity in SEVERITY_RANK ? item.severity : "medium";
    // Code that behaves wrongly is at least medium, so a real fault is never ranked with the small things.
    if (kind === "defect" && severity === "low") severity = "medium";
    const confidence = Number(item.confidence);
    const detail = String(item.detail ?? "").trim();
    out.push({
      id: `${seat}-${String(out.length + 1).padStart(2, "0")}`,
      seat, file, start_line: start, end_line: end, severity, kind,
      title: String(item.title ?? "").trim() || detail.slice(0, 120),
      detail,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    });
  }
  return out;
}

const words = (c) => new Set(`${c.title} ${c.detail}`.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? []);

function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function better(a, b) {
  if (a.severity !== b.severity) return SEVERITY_RANK[a.severity] < SEVERITY_RANK[b.severity];
  if (a.confidence !== b.confidence) return a.confidence > b.confidence;
  return a.detail.length >= b.detail.length;
}

// Drops a finding when another covers nearly the same lines in nearly the same words.
function dedupe(candidates) {
  const kept = [];
  for (const candidate of candidates) {
    const w = words(candidate);
    const twin = kept.findIndex(({ c, w: ow }) =>
      c.file === candidate.file
      && candidate.start_line <= c.end_line + NEARBY_LINES
      && c.start_line <= candidate.end_line + NEARBY_LINES
      && similarity(w, ow) >= DUPLICATE_SIMILARITY);
    if (twin === -1) kept.push({ c: candidate, w });
    else if (better(candidate, kept[twin].c)) kept[twin] = { c: candidate, w };
  }
  return kept.map(({ c }) => c);
}

// A finding with no verdict counts as uncertain; strict keeps only confirmed findings.
function applyVerdicts(candidates, verdicts, strict) {
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  const index = new Map(candidates.map((c, i) => [c.id, i]));
  const passes = (id) => {
    const verdict = byId.get(id)?.verdict ?? "uncertain";
    return verdict === "confirmed" || (verdict === "uncertain" && !strict);
  };
  return candidates.filter((c, position) => {
    if (!passes(c.id)) return false;
    const target = byId.get(c.id)?.duplicate_of;
    const targetPosition = target ? index.get(target) : undefined;
    if (!target || targetPosition === undefined || targetPosition === position || !passes(target)) return true;
    // Two findings that name each other as duplicates: keep the earlier one.
    return byId.get(target)?.duplicate_of === c.id && position < targetPosition;
  });
}

const rank = (candidates, max) => candidates
  .map((c, position) => ({ c, position }))
  .sort((a, b) => SEVERITY_RANK[a.c.severity] - SEVERITY_RANK[b.c.severity] || b.c.confidence - a.c.confidence || a.position - b.position)
  .slice(0, max)
  .map(({ c }) => c);

const count = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

function recommendation(findings) {
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  if (high) return `**Recommendation: fix, then merge.** ${count(high, "high severity finding")} should be fixed first.`;
  if (medium) return `**Recommendation: merge and fast-follow.** ${count(medium, "medium severity finding")} can be fixed after the merge.`;
  return "**Recommendation: merge.** The review found nothing of medium or high severity.";
}

function merge(dir, repo) {
  const seats = readdirSync(dir).filter((name) => /^seat-[\w-]+\.json$/.test(name)).sort();
  if (!seats.length) throw new Error(`no seat-*.json files in ${dir}`);
  const proposals = seats.flatMap((name) => normalize(readJson(join(dir, name)), name.slice(5, -5), repo));
  const candidates = dedupe(proposals);
  writeFileSync(join(dir, "candidates.json"), `${JSON.stringify(candidates, null, 2)}\n`);
  console.log(`${proposals.length} proposed from ${seats.length} seat(s), ${candidates.length} after merging repeats`);
  for (const c of candidates) console.log(`- ${c.id} ${c.file}:${c.start_line}-${c.end_line} (${c.severity}) ${c.title}`);
}

function final(dir, strict, max) {
  const candidates = readJson(join(dir, "candidates.json"));
  const verdictsPath = join(dir, "verdicts.json");
  const verified = existsSync(verdictsPath);
  const kept = verified ? applyVerdicts(candidates, readJson(verdictsPath), strict) : candidates;
  const ranked = rank(kept, max);
  const lines = [recommendation(ranked), ""];
  lines.push(`${ranked.length} finding(s) kept of ${candidates.length} candidate(s)${verified ? "" : ", unverified"}.`, "");
  for (const c of ranked) {
    lines.push(`- **${c.severity} ${c.kind}** \`${c.file}:${c.start_line}${c.end_line > c.start_line ? `-${c.end_line}` : ""}\` ${c.title.replace(/[.:]+$/, "")}. ${c.detail} (${c.id})`);
  }
  writeFileSync(join(dir, "review.md"), `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
}

const [command, dir, ...rest] = process.argv.slice(2);
const flag = (name) => rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined;
if (command === "merge" && dir) merge(dir, flag("--repo") ?? process.cwd());
else if (command === "final" && dir) final(dir, rest.includes("--strict"), Number(flag("--max") ?? 25));
else {
  console.error("usage: reduce.mjs merge <dir> [--repo <path>] | final <dir> [--strict] [--max <n>]");
  process.exit(2);
}
