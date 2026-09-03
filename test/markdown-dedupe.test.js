import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { selectUniqueMarkdown } from '../src/markdown-dedupe.js';

test('keeps the most complete Markdown for each source URL', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'media-dedupe-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const short = write(root, 'old.md', markdown('https://example.com/episode', '2026-01-01T00:00:00Z', 'short'));
  const complete = write(root, 'new.md', markdown('https://example.com/episode', '2026-01-02T00:00:00Z', 'a much longer transcript'));
  const other = write(root, 'other.md', markdown('https://example.com/other', '2026-01-01T00:00:00Z', 'other'));

  const result = selectUniqueMarkdown([short, complete, other]);

  assert.deepEqual(result.files.sort(), [complete, other].sort());
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].skipped, short);
});

test('falls back to podcast and episode id when source URL is absent', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'media-dedupe-fallback-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = write(root, 'first.md', markdown('', '2026-01-01T00:00:00Z', 'same', 'episode-1'));
  const second = write(root, 'second.md', markdown('', '2026-01-02T00:00:00Z', 'same', 'episode-1'));

  const result = selectUniqueMarkdown([first, second]);

  assert.equal(result.files.length, 1);
  assert.equal(result.files[0], second);
});

function write(root, name, content) {
  const file = path.join(root, name);
  fs.writeFileSync(file, content);
  return file;
}

function markdown(sourceUrl, transcribedAt, transcript, episodeId = 'episode') {
  return `---\npodcast: "Show"\nsource_url: ${sourceUrl ? `"${sourceUrl}"` : 'null'}\nepisode_id: "${episodeId}"\ntranscribed_at: "${transcribedAt}"\n---\n\n${transcript}\n`;
}
