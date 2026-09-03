#!/usr/bin/env node

import { selectUniqueMarkdown } from '../src/markdown-dedupe.js';

const { files, duplicates } = selectUniqueMarkdown(process.argv.slice(2));

for (const duplicate of duplicates) {
  process.stderr.write(`DUPLICATE_SKIPPED identity=${JSON.stringify(duplicate.identity)} kept=${JSON.stringify(duplicate.kept)} skipped=${JSON.stringify(duplicate.skipped)}\n`);
}

for (const file of files) process.stdout.write(`${file}\0`);
