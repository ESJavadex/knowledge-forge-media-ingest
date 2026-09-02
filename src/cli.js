#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { runMediaIngest } from './pipeline.js';
import { transcribeWithFasterWhisper, transcribeWithWhisper } from './transcriber.js';

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

const url = args[0];
if (url.startsWith('-')) fail('The first argument must be a Spotify, RSS, or YouTube URL.');

try {
  const knowledgeForge = optionValue('--knowledge-forge');
  const explicitOutput = optionValue('--output');
  const knowledgeForgeRoot = knowledgeForge ? path.resolve(knowledgeForge) : null;
  if (knowledgeForgeRoot) {
    validateKnowledgeForge(knowledgeForgeRoot);
    ensureLocalMediaExclude(knowledgeForgeRoot);
  }
  const outputRoot = explicitOutput
    ? path.resolve(explicitOutput)
    : knowledgeForgeRoot
      ? path.join(knowledgeForgeRoot, 'raw', 'media')
      : path.resolve('output');
  const engine = optionValue('--engine', 'faster-whisper');
  const model = optionValue('--model', engine === 'faster-whisper' ? 'large-v3-turbo' : 'turbo');

  const onMarkdown = knowledgeForgeRoot
    ? async (markdownPath) => {
      execFileSync(process.execPath, [path.join(knowledgeForgeRoot, 'src', 'cli.js'), 'ingest', markdownPath], {
        cwd: knowledgeForgeRoot,
        encoding: 'utf8',
        stdio: 'inherit',
      });
    }
    : null;

  const result = await runMediaIngest(url, {
    all: args.includes('--all'),
    latest: optionValue('--latest', '1'),
    after: optionValue('--after'),
    before: optionValue('--before'),
    match: optionValue('--match'),
    oldestFirst: args.includes('--oldest-first'),
    dryRun: args.includes('--dry-run') || args.includes('--list'),
    downloadOnly: args.includes('--download-only'),
    model,
    language: optionValue('--language', 'es'),
    engine,
    deleteAudio: args.includes('--delete-audio'),
    force: args.includes('--force'),
    cacheRoot: path.resolve(optionValue('--cache', '.media-cache')),
    outputRoot,
    integrationKey: knowledgeForgeRoot ? `knowledge-forge:${knowledgeForgeRoot}` : null,
    onMarkdown,
    transcribeFn: engine === 'whisper'
      ? transcribeWithWhisper
      : transcribeWithFasterWhisper,
  });
  console.log(`\n✅ Processed ${result.processed.length}; skipped ${result.skipped.length}; failed ${result.failures.length}.\n`);
  if (result.failures.length > 0) process.exitCode = 1;
} catch (error) {
  fail(error.message);
}

function optionValue(flag, fallback = null) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function validateKnowledgeForge(root) {
  const cliPath = path.join(root, 'src', 'cli.js');
  const packagePath = path.join(root, 'package.json');
  if (!fs.existsSync(cliPath) || !fs.existsSync(packagePath)) {
    throw new Error(`Not a Knowledge Forge checkout: ${root}`);
  }
}

function ensureLocalMediaExclude(root) {
  const gitDirectory = path.join(root, '.git');
  if (!fs.existsSync(gitDirectory)) return;
  const excludePath = path.join(gitDirectory, 'info', 'exclude');
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const pattern = '/raw/media/';
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';
  if (!existing.split(/\r?\n/).includes(pattern)) {
    fs.appendFileSync(excludePath, `${existing.endsWith('\n') || existing.length === 0 ? '' : '\n'}${pattern}\n`);
  }
}

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exitCode = 1;
}

function printHelp() {
  console.log(`
knowledge-forge-media-ingest

Turn a Spotify show, podcast RSS feed, or YouTube channel/playlist/video into
one timestamped Markdown document per episode.

Usage:
  media-ingest URL [options]

Selection:
  --latest N             Process at most N episodes (default: 1)
  --all                  Process every matching episode
  --after YYYY-MM-DD     Inclusive publication date lower bound
  --before YYYY-MM-DD    Inclusive publication date upper bound
  --match TEXT           Case-insensitive title filter
  --oldest-first         Process oldest matching episodes first
  --list, --dry-run      Preview without downloading

Output and integration:
  --output PATH          Markdown destination (default: ./output)
  --cache PATH           Audio/transcript cache (default: ./.media-cache)
  --knowledge-forge PATH Write to PATH/raw/media and ingest each Markdown file

Transcription:
  --model MODEL          Model (default: large-v3-turbo; turbo with --engine whisper)
  --engine ENGINE        Transcription engine: faster-whisper (default) or whisper
  --language CODE        Language code (default: es; use auto to detect)
  --download-only        Cache audio without transcribing
  --delete-audio         Delete audio after successful transcription
  --force                Regenerate completed episodes
`);
}
