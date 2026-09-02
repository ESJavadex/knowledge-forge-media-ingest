import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { ensureDir } from './utils.js';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FW_SCRIPT = path.join(PACKAGE_ROOT, 'scripts', 'transcribe_fw.py');

export function resolveFasterWhisperPython() {
  if (process.env.FASTER_WHISPER_PYTHON) return process.env.FASTER_WHISPER_PYTHON;
  const localVenv = path.join(PACKAGE_ROOT, '.venv-fw', 'bin', 'python');
  return fs.existsSync(localVenv) ? localVenv : 'python3';
}

export function transcribeWithFasterWhisper(audioPath, {
  model = 'large-v3-turbo',
  language = 'es',
  outputDir = path.dirname(audioPath),
  threads = 4,
  batch = 8,
  computeType = 'int8',
  python = resolveFasterWhisperPython(),
  runCommand = execFileSync,
} = {}) {
  ensureDir(outputDir);
  runCommand(python, [
    FW_SCRIPT,
    audioPath,
    '--model', model,
    '--language', language,
    '--output-dir', outputDir,
    '--threads', String(threads),
    '--batch', String(batch),
    '--compute-type', computeType,
  ], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  return loadTranscriptJson(outputDir, audioPath, language);
}

function loadTranscriptJson(outputDir, audioPath, language) {
  const transcriptPath = path.join(outputDir, `${path.basename(audioPath, path.extname(audioPath))}.json`);
  if (!fs.existsSync(transcriptPath)) throw new Error(`Transcriber did not create ${transcriptPath}`);
  const result = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
  return {
    language: result.language || language,
    text: result.text || '',
    segments: (result.segments || []).map((segment) => ({
      start: Number(segment.start) || 0,
      end: Number(segment.end) || Number(segment.start) || 0,
      text: String(segment.text || '').trim(),
    })).filter((segment) => segment.text),
    transcriptPath,
  };
}

export function transcribeWithWhisper(audioPath, {
  model = 'turbo',
  language = 'es',
  outputDir = path.dirname(audioPath),
  runCommand = execFileSync,
} = {}) {
  ensureDir(outputDir);
  const args = [
    audioPath,
    '--model', model,
    '--output_format', 'json',
    '--output_dir', outputDir,
    '--verbose', 'False',
  ];
  if (language && language !== 'auto') args.push('--language', language);
  runCommand('whisper', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });

  return loadTranscriptJson(outputDir, audioPath, language);
}
