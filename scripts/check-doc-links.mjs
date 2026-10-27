#!/usr/bin/env node
// Validate local Markdown links and heading fragments without network access.
// This intentionally does not claim to check HTTP URLs or reference-style links.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo', 'coverage']);
const failures = [];
let documents = 0;
let fileLinks = 0;
let anchors = 0;

function filesIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesIn(full);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [full] : [];
  });
}

function headingSlug(text) {
  // GitHub-style heading ID: inline formatting does not belong to the slug.
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\x60/g, '').replace(/\\([*_])/g, '$1')
    .toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
    .replace(/\s/g, '-');
}

const headingCache = new Map();
function headingIds(file) {
  if (headingCache.has(file)) return headingCache.get(file);
  const ids = new Set();
  const duplicateCounts = new Map();
  let fenced = false;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+\s*)?$/);
    if (heading) {
      const slug = headingSlug(heading[1].trim());
      const number = duplicateCounts.get(slug) ?? 0;
      ids.add(number ? `${slug}-${number}` : slug);
      duplicateCounts.set(slug, number + 1);
    }
    // Allow explicit HTML anchors where a document intentionally uses them.
    for (const match of line.matchAll(/<a\s+(?:[^>]*?\s)?(?:id|name)=["']([^"']+)["']/gi))
      ids.add(match[1]);
  }
  headingCache.set(file, ids);
  return ids;
}

function fail(source, line, target, why) {
  failures.push(`${path.relative(root, source).replaceAll('\\', '/') }:${line}: ${why} → ${target}`);
}

for (const source of filesIn(root)) {
  documents++;
  let fenced = false;
  const lines = fs.readFileSync(source, 'utf8').split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    // Ignore inline code spans; those are examples, not rendered links.
    const prose = line.replace(/`[^`]*`/g, '');
    for (const match of prose.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']+["'])?\)/g)) {
      const raw = match[1].replace(/^<|>$/g, '');
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) continue;
      const [relative, fragment] = raw.split('#', 2);
      let target;
      try { target = path.resolve(path.dirname(source), decodeURIComponent(relative.split('?')[0])); }
      catch { fail(source, n + 1, raw, '非法 URL 编码'); continue; }
      if (!fs.existsSync(target)) { fail(source, n + 1, raw, '文件目标不存在'); continue; }
      if (relative) fileLinks++;
      if (fragment && target.toLowerCase().endsWith('.md')) {
        anchors++;
        let slug;
        try { slug = decodeURIComponent(fragment); }
        catch { fail(source, n + 1, raw, '非法标题 URL 编码'); continue; }
        if (!headingIds(target).has(slug)) fail(source, n + 1, raw, '标题锚点不存在');
      }
    }
  }
}

console.log(`Markdown 文档 ${documents} | 本地文件链接 ${fileLinks} | 标题锚点 ${anchors} | 错误 ${failures.length}`);
for (const message of failures) console.error(message);
if (failures.length) process.exitCode = 1;
