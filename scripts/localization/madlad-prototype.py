"""Bounded local MADLAD quality trial on public authored copy, never a release gate."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import time

SOURCE_KEYS = [
    "An interactive guide, with curated answers. No AI account needed. Your choices stay on this page and reset when you leave.",
    "No cloud account, identity provider, or API key is required. Keep the listener private and back up the state you own.",
    "Use the local launcher with no cloud account or AI key. Your state stays on your device; the local server accepts loopback access.",
    "Who will this CRM help?",
    "Room for",
    "Supported runtime",
    "No sign-in or API key",
    "Mark suggestion useful",
    "Support tickets",
    "Approve",
    "Reject",
    "Queued",
    "Emergency stop",
    "Emergency stop active. Further approvals and executions are blocked; existing receipt remains visible.",
    "Emergency stop cleared; agent remains paused.",
    "Clearing an emergency stop always leaves the agent paused.",
    "Sample follow-up added to Tasks. Nothing was sent.",
    "{0} must be true or false.",
    "Delete “{title}”? Its search index and links will also be removed.",
    "Revoking {name} cancels its pending and authorized work and cannot be undone for this agent. Type {confirmation} to continue.",
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--locales", default="es-ES,fr-FR,hi-IN,ja-JP,te-IN")
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cuda")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--beam-size", type=int, default=2)
    parser.add_argument("--dll-dir")
    parser.add_argument("--output", default="output/localization-tools/madlad-prototype.json")
    args = parser.parse_args()
    root = Path("output/localization-tools").resolve()
    model_dir = root / "madlad-int8"
    dll_handle = None
    if args.dll_dir and os.name == "nt":
        dll_handle = os.add_dll_directory(args.dll_dir)
        os.environ["PATH"] = args.dll_dir + os.pathsep + os.environ["PATH"]
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
    import ctranslate2
    from transformers import T5Tokenizer

    shared_spec = importlib.util.spec_from_file_location("local_translation_helpers", Path(__file__).with_name("translate-catalog.py"))
    shared = importlib.util.module_from_spec(shared_spec)
    shared_spec.loader.exec_module(shared)
    source = json.loads(Path("locales/source.json").read_text(encoding="utf-8"))
    if any(key not in source for key in SOURCE_KEYS):
        raise ValueError(f"Prototype source no longer allowlisted: {[key for key in SOURCE_KEYS if key not in source]}")
    hints = json.loads(Path("scripts/localization/source-hints.json").read_text(encoding="utf-8"))
    tokenizer = T5Tokenizer.from_pretrained(str(model_dir), local_files_only=True)
    codes = "es fr pt de ar zh hi bn ur pa mr gu ta te kn ml ne si ja ko vi th id ms fil my km lo ru uk pl cs ro hu el tr it nl sv da no fi he fa sw am ha yo zu jv su ig".split()
    missing_tokens = [code for code in codes if tokenizer.convert_tokens_to_ids(f"<2{code}>") == tokenizer.unk_token_id]
    if missing_tokens:
        raise ValueError(f"Unsupported model target tokens: {missing_tokens}")
    print(json.dumps({"event": "loading-model", "targetTokensChecked": len(codes), "device": args.device}), flush=True)
    start = time.monotonic()
    translator = ctranslate2.Translator(str(model_dir), device=args.device,
                                      compute_type="int8_float16" if args.device == "cuda" else "int8",
                                      inter_threads=1, intra_threads=4)
    print(json.dumps({"event": "model-loaded", "seconds": round(time.monotonic() - start, 2)}), flush=True)

    def mask(text):
        spans = sorted((m.start(), m.end()) for regex in [shared.PLACEHOLDER, shared.PROTECTED] for m in regex.finditer(text))
        merged = []
        for begin, end in spans:
            if merged and begin <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
            else:
                merged.append((begin, end))
        replacements = [(begin, end, str(987650001 + index), text[begin:end]) for index, (begin, end) in enumerate(merged)]
        for begin, end, marker, _ in reversed(replacements):
            text = text[:begin] + marker + text[end:]
        return text, [(marker, original) for _, _, marker, original in replacements]

    report = {"model": "Nextcloud-AI/madlad400-3b-mt-ct2-int8", "revision": "aa32bbdeba7880eff2096ec044cb155a340a9400",
              "device": args.device, "beamSize": args.beam_size, "batchSize": args.batch_size, "locales": {}}
    for locale in args.locales.split(","):
        language = {"tl": "fil", "nb": "no"}.get(locale.split("-")[0], locale.split("-")[0])
        prepared = [mask(hints.get(key, key)) for key in SOURCE_KEYS]
        # Raw output tests the model's fidelity. Protected output tests the actual
        # proposed pipeline. Neither uses curated overrides to disguise errors.
        texts = [source[key] for key in SOURCE_KEYS] + [text for text, _ in prepared]
        tokens = [tokenizer.convert_ids_to_tokens(tokenizer.encode(f"<2{language}> " + text)) for text in texts]
        begin = time.monotonic()
        outputs = []
        for offset in range(0, len(tokens), args.batch_size):
            results = translator.translate_batch(tokens[offset:offset + args.batch_size], beam_size=args.beam_size,
                                                 max_batch_size=args.batch_size, max_decoding_length=384)
            outputs.extend(tokenizer.decode(tokenizer.convert_tokens_to_ids(result.hypotheses[0]), skip_special_tokens=True).strip() for result in results)
            print(json.dumps({"locale": locale, "done": len(outputs), "total": len(tokens), "seconds": round(time.monotonic() - begin, 1)}), flush=True)
        entries = {}
        for index, key in enumerate(SOURCE_KEYS):
            raw = outputs[index]
            protected = outputs[index + len(SOURCE_KEYS)]
            for marker, original in prepared[index][1]:
                protected = protected.replace(marker, original)
            required = [m.group() for regex in [shared.PLACEHOLDER, shared.PROTECTED] for m in regex.finditer(key)]
            preserved = (sorted(shared.PLACEHOLDER.findall(key)) == sorted(shared.PLACEHOLDER.findall(protected))
                         and all(protected.count(token) == key.count(token) for token in required))
            entries[key] = {"raw": raw, "protected": protected, "tokensPreserved": preserved}
        report["locales"][locale] = {"seconds": round(time.monotonic() - begin, 1), "entries": entries}
        shared.write_json(Path(args.output), report)
        print(json.dumps({"locale": locale, "complete": True, "seconds": report["locales"][locale]["seconds"]}), flush=True)
    if dll_handle:
        dll_handle.close()


if __name__ == "__main__":
    main()
