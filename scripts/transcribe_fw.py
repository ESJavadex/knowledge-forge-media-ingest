#!/usr/bin/env python3
"""faster-whisper transcriber: same JSON contract as the openai-whisper wrapper.

Usage: transcribe_fw.py AUDIO --model large-v3-turbo --language es \
         --output-dir DIR [--threads 4] [--batch 8] [--compute-type int8]
Writes DIR/<audio-basename>.json with {language, text, segments:[{start,end,text}]}.
"""
import argparse
import json
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("--model", default="large-v3-turbo")
    parser.add_argument("--language", default="es")
    parser.add_argument("--output-dir", default=".")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--compute-type", default="int8")
    args = parser.parse_args()

    os.environ.setdefault("OMP_NUM_THREADS", str(args.threads))

    from faster_whisper import BatchedInferencePipeline, WhisperModel

    model = WhisperModel(args.model, device="cpu", compute_type=args.compute_type, cpu_threads=args.threads)
    pipeline = BatchedInferencePipeline(model=model)
    segments_iter, info = pipeline.transcribe(
        args.audio,
        language=None if args.language in ("auto", "none") else args.language,
        batch_size=args.batch,
        vad_filter=True,
    )
    segments = [
        {"start": float(s.start), "end": float(s.end), "text": s.text.strip()}
        for s in segments_iter
        if s.text and s.text.strip()
    ]

    os.makedirs(args.output_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(args.audio))[0]
    out_path = os.path.join(args.output_dir, f"{base}.json")
    payload = {
        "language": info.language if hasattr(info, "language") else args.language,
        "text": " ".join(s["text"] for s in segments),
        "segments": segments,
    }
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False)
    print(out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
