import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runMediaIngest, selectEpisodes } from '../src/pipeline.js';

const episodes = [
  episode('new', 'Fascia y dolor corporal', '2026-09-01T16:00:00.000Z'),
  episode('middle', 'Protector solar y cáncer', '2026-08-31T16:00:00.000Z'),
  episode('old', 'Ayuno intermitente', '2026-08-28T16:00:00.000Z'),
];

test('filters episodes inclusively by date, title, limit, and ordering', () => {
  assert.deepEqual(selectEpisodes(episodes, { all: true, after: '2026-08-30', before: '2026-09-01' }).map((item) => item.id), ['new', 'middle']);
  assert.deepEqual(selectEpisodes(episodes, { all: true, match: 'ayuno' }).map((item) => item.id), ['old']);
  assert.deepEqual(selectEpisodes(episodes, { latest: 2, oldestFirst: true }).map((item) => item.id), ['old', 'middle']);
  assert.throws(() => selectEpisodes(episodes, { all: true, after: '09/01/2026' }), /YYYY-MM-DD/);
});

test('creates one formatted Markdown transcript and skips completed work', async (context) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'media-ingest-'));
  context.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const integrated = [];
  const options = fixtureOptions(fixtureRoot, {
    integrationKey: 'test:wiki',
    onMarkdown: async (markdownPath) => integrated.push(markdownPath),
  });

  const first = await runMediaIngest('https://open.spotify.com/show/test', options);
  assert.equal(first.processed.length, 1);
  assert.equal(integrated.length, 1);
  const markdown = fs.readFileSync(first.processed[0].markdownPath, 'utf8');
  assert.match(markdown, /title: "Fascia y dolor corporal"/);
  assert.match(markdown, /published: "2026-09-01"/);
  assert.match(markdown, /## Description/);
  assert.match(markdown, /## Transcript/);
  assert.match(markdown, /\*\*\[00:00\]\*\* Bienvenidos al episodio/);
  assert.match(markdown, /### 05:00–05:18/);

  const second = await runMediaIngest('https://open.spotify.com/show/test', options);
  assert.equal(second.processed.length, 0);
  assert.equal(second.skipped.length, 1);
  assert.equal(integrated.length, 1);
});

test('integrates an existing Markdown later without downloading or transcribing again', async (context) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'media-ingest-resume-'));
  context.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  let downloads = 0;
  let transcriptions = 0;
  let integrations = 0;
  const common = fixtureOptions(fixtureRoot, {
    downloadFn: async (_episode, outputPath) => { downloads += 1; fs.writeFileSync(outputPath, 'audio'); },
    transcribeFn: () => {
      transcriptions += 1;
      return { language: 'es', text: 'Texto', segments: [{ start: 0, end: 1, text: 'Texto' }] };
    },
  });

  await runMediaIngest('https://spotify.test/show', common);
  assert.deepEqual({ downloads, transcriptions, integrations }, { downloads: 1, transcriptions: 1, integrations: 0 });

  const integrated = await runMediaIngest('https://spotify.test/show', {
    ...common,
    integrationKey: 'knowledge-forge:/tmp/example',
    onMarkdown: async () => { integrations += 1; },
  });
  assert.deepEqual({ downloads, transcriptions, integrations }, { downloads: 1, transcriptions: 1, integrations: 1 });
  assert.equal(integrated.processed[0].status, 'integrated');

  const repeated = await runMediaIngest('https://spotify.test/show', {
    ...common,
    integrationKey: 'knowledge-forge:/tmp/example',
    onMarkdown: async () => { integrations += 1; },
  });
  assert.equal(repeated.skipped.length, 1);
  assert.equal(integrations, 1);
});

test('migrates the original Knowledge Forge manifest and relocated cache paths', async (context) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'media-ingest-legacy-'));
  context.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const cacheRoot = path.join(fixtureRoot, '.media-cache');
  const outputRoot = path.join(fixtureRoot, 'raw', 'media');
  const markdownPath = path.join(outputRoot, 'dr-borja-bandera', 'episode.md');
  const relocatedAudio = path.join(cacheRoot, 'audio', 'dr-borja-bandera', 'episode.mp3');
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.mkdirSync(path.dirname(relocatedAudio), { recursive: true });
  fs.writeFileSync(markdownPath, '# Existing transcript\n');
  fs.writeFileSync(relocatedAudio, 'audio');
  fs.writeFileSync(path.join(cacheRoot, 'manifest.json'), JSON.stringify({
    version: 1,
    episodes: {
      'spotify:new': {
        status: 'complete',
        rawPath: markdownPath,
        audioPath: `/old/checkout/.media-cache/audio/dr-borja-bandera/episode.mp3`,
      },
    },
  }));
  let integrations = 0;

  const result = await runMediaIngest('https://spotify.test/show', {
    ...fixtureOptions(fixtureRoot),
    cacheRoot,
    outputRoot,
    integrationKey: 'knowledge-forge:test',
    onMarkdown: async (receivedPath) => {
      integrations += 1;
      assert.equal(receivedPath, markdownPath);
    },
    downloadFn: async () => assert.fail('legacy complete episode should not download again'),
    transcribeFn: () => assert.fail('legacy complete episode should not transcribe again'),
  });

  assert.equal(result.processed[0].status, 'integrated');
  assert.equal(integrations, 1);
  const migrated = JSON.parse(fs.readFileSync(path.join(cacheRoot, 'manifest.json'), 'utf8'));
  assert.equal(migrated.episodes['spotify:new'].audioPath, relocatedAudio);
  assert.equal(migrated.episodes['spotify:new'].markdownPath, markdownPath);
});

function fixtureOptions(fixtureRoot, overrides = {}) {
  return {
    latest: 1,
    cacheRoot: path.join(fixtureRoot, 'cache'),
    outputRoot: path.join(fixtureRoot, 'output'),
    logger: { log() {}, error() {} },
    resolveFn: async () => ({
      type: 'spotify',
      title: 'Dr. Borja Bandera',
      feedUrl: 'https://feeds.megaphone.fm/test',
      originalUrl: 'https://open.spotify.com/show/test',
      episodes,
    }),
    downloadFn: async (_episode, outputPath) => fs.writeFileSync(outputPath, 'audio'),
    transcribeFn: (_audioPath, { model }) => ({
      language: 'es',
      text: 'Texto de prueba',
      transcriptPath: path.join(fixtureRoot, `${model}.json`),
      segments: [
        { start: 0, end: 8, text: 'Bienvenidos al episodio.' },
        { start: 310, end: 318, text: 'Segunda sección.' },
      ],
    }),
    ...overrides,
  };
}

function episode(id, title, publishedAt) {
  return {
    id,
    title,
    publishedAt,
    description: `Descripción de ${title}`,
    durationSeconds: 1214,
    sourceUrl: `https://example.com/${id}`,
    audioUrl: `https://cdn.example.com/${id}.mp3`,
    sourceType: 'rss',
    downloadStrategy: 'http',
  };
}
