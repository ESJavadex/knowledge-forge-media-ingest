# Knowledge Forge Media Ingest

Standalone ingestion add-on that turns **Spotify shows, podcast RSS feeds, and YouTube channels/playlists/videos** into timestamped Markdown. It can feed [Knowledge Forge](https://github.com/ESJavadex/knowledge-forge), but it does not depend on or modify its ingestion internals.

## Why a separate repository?

Media acquisition has a different dependency and failure profile from a knowledge base: `yt-dlp`, FFmpeg, Whisper models, large audio caches, RSS parsing, and third-party source changes. Keeping it here preserves a small contract between projects:

```text
Spotify / RSS / YouTube → Markdown files → Knowledge Forge ingest CLI
```

The Markdown is usable by any other wiki, RAG pipeline, or note system.

## Features

- Spotify show resolution through the matching public podcast RSS feed.
- Direct RSS/Atom podcast feeds.
- YouTube channels, playlists, and individual videos through `yt-dlp`.
- Approximate upload dates for flat YouTube playlists, enabling date-range selection without downloading every video first.
- Local transcription with faster-whisper by default, with OpenAI Whisper as a fallback engine.
- One Markdown file per episode with title, publication date, description, source metadata, and timestamped transcript.
- Inclusive date ranges, title matching, newest/oldest ordering, and safe one-episode default.
- Incremental manifest: completed episodes are skipped and failed work can resume.
- Optional Knowledge Forge adapter through its public `ingest` CLI.
- Audio, Whisper JSON, and generated Markdown are ignored by Git by default.

## Requirements

- Node.js 20+
- FFmpeg
- Python 3.10+ with [`faster-whisper`](https://github.com/SYSTRAN/faster-whisper) (recommended) or [`openai-whisper`](https://github.com/openai/whisper)
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) for YouTube

```bash
sudo apt install ffmpeg
uv tool install yt-dlp
python3 -m venv .venv-fw
.venv-fw/bin/pip install -r requirements-faster-whisper.txt
```

Keep `yt-dlp` current because YouTube changes frequently.

## Install

```bash
git clone https://github.com/ESJavadex/knowledge-forge-media-ingest.git
cd knowledge-forge-media-ingest
npm install
npm link                 # exposes the media-ingest command locally
```

You can also run `node src/cli.js` without linking.

## Usage

Preview the latest episode without downloading:

```bash
media-ingest "https://open.spotify.com/show/SHOW_ID" --list
```

Create Markdown for the latest three episodes:

```bash
media-ingest "https://open.spotify.com/show/SHOW_ID" --latest 3
```

The default engine is `faster-whisper` with `large-v3-turbo`, Spanish, CPU `int8`, four threads, and batched inference. To use the original OpenAI implementation instead:

```bash
pip install openai-whisper
media-ingest "URL" --engine whisper --model turbo --language es
```

If the faster-whisper environment lives elsewhere, set `FASTER_WHISPER_PYTHON` to its Python executable.

Filter by inclusive publication dates:

```bash
media-ingest "https://feeds.example.com/podcast.xml" \
  --all --after 2026-01-01 --before 2026-03-31
```

Filter a YouTube channel by title and process oldest first:

```bash
media-ingest "https://youtube.com/@channel/videos" \
  --all --match "inteligencia artificial" --oldest-first
```

### Knowledge Forge integration

Pass a local Knowledge Forge checkout. The add-on writes Markdown under its `raw/media/` directory and invokes the existing generic ingest command for every completed file:

```bash
media-ingest "https://open.spotify.com/show/SHOW_ID" \
  --latest 3 \
  --knowledge-forge /path/to/knowledge-forge
```

Knowledge Forge remains unaware of Spotify, YouTube, Whisper, or media caches.
The adapter adds `/raw/media/` to that checkout's local `.git/info/exclude`, so generated transcripts are not accidentally committed and no media-specific ignore rule is added to Knowledge Forge itself.

## Output

Without an integration, files are written to `output/<show>/`. Each episode looks like:

```markdown
---
type: media-transcript
title: "Episode name"
podcast: "Show name"
published: "2026-09-01"
source_url: "https://..."
---

# Episode name

## Description

Episode description...

## Transcript

### 00:00–05:00

**[00:12]** Timestamped transcript...
```

Audio and Whisper output live under `.media-cache/`. Use `--delete-audio` to remove audio after successful transcription.

## Spotify limitation

Spotify does not expose podcast audio through its public API. This project resolves a show to an exact public RSS directory match. Publicly distributed shows work; Spotify-exclusive or DRM-protected shows fail clearly and are not circumvented.

## Test

```bash
npm test
```

## License

MIT
