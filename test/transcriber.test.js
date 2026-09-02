import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { transcribeWithFasterWhisper } from '../src/transcriber.js';

test('faster-whisper adapter invokes the portable Python helper and reads its JSON contract', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'media-transcriber-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const audioPath = path.join(root, 'episode.mp3');
  fs.writeFileSync(audioPath, 'audio fixture');

  let invocation;
  const result = transcribeWithFasterWhisper(audioPath, {
    python: '/custom/python',
    outputDir: root,
    runCommand(binary, args) {
      invocation = { binary, args };
      fs.writeFileSync(path.join(root, 'episode.json'), JSON.stringify({
        language: 'es',
        text: 'Texto de prueba.',
        segments: [{ start: 1.25, end: 2.5, text: ' Texto de prueba. ' }],
      }));
    },
  });

  assert.equal(invocation.binary, '/custom/python');
  assert.ok(invocation.args[0].endsWith('scripts/transcribe_fw.py'));
  assert.equal(result.language, 'es');
  assert.deepEqual(result.segments, [{ start: 1.25, end: 2.5, text: 'Texto de prueba.' }]);
});
