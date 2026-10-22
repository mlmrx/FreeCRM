"""Translate checked-in PUBLIC UI copy locally; never use with workspace data.

Requires the model prepared by prepare-model.py. Output is a draft catalog for
review, with a resumable cache and a report of suspicious or unchanged strings.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import time

MODEL_REVISION = "55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636"
PIPELINE_VERSION = "protected-numeric-markers-v3"
SOURCE_HINTS = {}
PLACEHOLDER = re.compile(r"\{\{?[^{}]+\}\}?")
PROTECTED = re.compile(
    r"`[^`\n]+`|FREE CRM|\b(?:FREECRM|Cloudflare|Vercel|GitHub|Ollama|Docker|OpenAI|SQLite|D1|R2|MCP|SSO|SCIM|API|CSV|JSON|AI|CRM|PostgreSQL|OAuth|SQL|S3|HTTP|HTTPS|URL|SDK)\b"
    r"|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b"
    r"|\b(?:true|false|null|undefined)\b|(?<!\w)\d+(?:[.,]\d+)*(?!\w)"
    r"|\b[a-z][a-z0-9-]*:[a-z][a-z0-9.-]*(?::[a-z0-9.-]+)*\b"
    r"|https?://[^\s]+|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}"
)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def model_language(locale):
    return {"zh-Hant": "zh", "zh-Hans": "zh", "nb": "no", "fil": "tl"}.get(
        locale, {"nb": "no", "fil": "tl"}.get(locale.split("-")[0], locale.split("-")[0])
    )


def signature(text, locale, beam_size):
    if text in SOURCE_HINTS:
        text += "\0source-hint=" + SOURCE_HINTS[text]
    if MODEL_REVISION == "5ecfd223f954f860b67f1b4c42e6f4c70d347581":
        text += "\0sentence-segmentation-v1"
    return hashlib.sha256(f"{MODEL_REVISION}\0{PIPELINE_VERSION}\0{beam_size}\0{locale}\0{text}".encode()).hexdigest()


def suspicious_output(source, translation):
    artifact = re.search(r"(?:Comment|QLabel|QObject|QT_TR_NOOP)$", translation)
    if artifact and artifact.group().casefold() not in source.casefold():
        return True
    repeated = re.search(r"(\w{4,})\1", translation, re.IGNORECASE)
    if repeated and repeated.group().casefold() not in source.casefold():
        return True
    words = translation.casefold().split()
    if len(words) >= 6 and any(words.count(word) >= 5 and words.count(word) / len(words) > 0.4 for word in set(words) if len(word) >= 4):
        return True
    return len(translation) > max(100, len(source) * 5)


def main():
    global MODEL_REVISION, SOURCE_HINTS
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="JSON string map, or object with a messages string map")
    parser.add_argument("--locales", required=True, help="Comma-separated BCP-47 locales")
    parser.add_argument("--root", default="output/localization-tools")
    parser.add_argument("--output", default="output/localization-tools/catalogs")
    parser.add_argument("--overrides", default="output/localization/reviewed-overrides.json", help="Optional locale to English source to reviewed translation map")
    parser.add_argument("--report", default="output/localization-tools/translation-report.json", help="Authoring metadata; kept outside published assets")
    parser.add_argument("--model", choices=["m2m100", "opus-en-dra"], default="m2m100")
    parser.add_argument("--curated-overrides", default="scripts/localization/overrides.json")
    parser.add_argument("--safety-overrides", default="scripts/localization/curated-controls.json")
    parser.add_argument("--source-hints", default="scripts/localization/source-hints.json")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    parser.add_argument("--dll-dir", help="Existing CUDA 12 cublas DLL directory on Windows")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--beam-size", type=int, default=2)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--sample", type=int, default=0, help="Evenly sample source for a representative benchmark")
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    if args.model == "opus-en-dra":
        MODEL_REVISION = "5ecfd223f954f860b67f1b4c42e6f4c70d347581"
    SOURCE_HINTS = json.loads(Path(args.source_hints).read_text(encoding="utf-8")) if Path(args.source_hints).exists() else {}
    root = Path(args.root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
    dll_handle = None
    if args.dll_dir and os.name == "nt":
        dll_handle = os.add_dll_directory(str(Path(args.dll_dir).resolve()))
        os.environ["PATH"] = str(Path(args.dll_dir).resolve()) + os.pathsep + os.environ["PATH"]
    import ctranslate2
    from transformers import M2M100Tokenizer, MarianTokenizer

    source = json.loads(Path(args.source).read_text(encoding="utf-8-sig"))
    overrides = json.loads(Path(args.overrides).read_text(encoding="utf-8-sig")) if Path(args.overrides).exists() else {}
    messages = source.get("messages", source)
    if not isinstance(messages, dict) or any(not isinstance(v, str) for v in messages.values()):
        raise ValueError("Source must be a public UI string map")
    if args.limit:
        messages = dict(list(messages.items())[:args.limit])
    if args.sample and args.sample < len(messages):
        entries = list(messages.items())
        messages = dict(entries[index * (len(entries) - 1) // max(1, args.sample - 1)] for index in range(args.sample))
    tokenizer_class = M2M100Tokenizer if args.model == "m2m100" else MarianTokenizer
    model_directory = "m2m100" if args.model == "m2m100" else "opus-en-dra"
    tokenizer = tokenizer_class.from_pretrained(str(root / f"{model_directory}-source"), local_files_only=True)
    if args.model == "m2m100":
        tokenizer.src_lang = "en"
    translator = ctranslate2.Translator(
        str(root / f"{model_directory}-int8"), device=args.device,
        compute_type="int8_float16" if args.device == "cuda" else "int8",
        inter_threads=1, intra_threads=args.threads,
    )
    cache_path = root / "translation-cache.jsonl"
    cache = {}
    cache_fallback = {}
    if cache_path.exists():
        for line in cache_path.read_text(encoding="utf-8").splitlines():
            try:
                item = json.loads(line)
                cache[item["hash"]] = item["translation"]
                cache_fallback[item["hash"]] = item.get("protectedFallback", False)
            except (json.JSONDecodeError, KeyError):
                continue

    def translate_batch(texts, language):
        prefix = "" if args.model == "m2m100" else f">>{ {'te': 'tel', 'ta': 'tam', 'kn': 'kan', 'ml': 'mal'}[language] }<< "
        segments = [re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", text) if args.model == "opus-en-dra" else [text] for text in texts]
        tokens = [tokenizer.convert_ids_to_tokens(tokenizer.encode(prefix + text)) for parts in segments for text in parts]
        target_prefix = [[tokenizer.lang_code_to_token[language]]] * len(tokens) if args.model == "m2m100" else None
        longest = max(map(len, tokens))
        safe_batch = max(2, min(args.batch_size, 4096 // max(1, longest)))
        while True:
            try:
                results = translator.translate_batch(
                    tokens, target_prefix=target_prefix, beam_size=args.beam_size,
                    max_batch_size=safe_batch, max_decoding_length=min(512, max(64, longest * 3)),
                    repetition_penalty=1.05, no_repeat_ngram_size=4,
                )
                break
            except RuntimeError as error:
                if "out of memory" not in str(error).lower() or safe_batch <= 2:
                    raise
                safe_batch = max(2, safe_batch // 2)
                print(json.dumps({"event": "retry-smaller-batch", "batchSize": safe_batch}), flush=True)
        decoded = iter(tokenizer.decode(tokenizer.convert_tokens_to_ids(r.hypotheses[0][1:] if args.model == "m2m100" else r.hypotheses[0]),
                                       skip_special_tokens=True).strip() for r in results)
        return [" ".join(next(decoded) for _ in parts) for parts in segments]

    def protected_parts(text):
        spans = sorted([(m.start(), m.end()) for regex in [PLACEHOLDER, PROTECTED]
                        for m in regex.finditer(text)])
        merged = []
        for start, end in spans:
            if merged and start <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
            else:
                merged.append((start, end))
        return merged

    def mask_protected(text):
        replacements = []
        for index, (start, end) in enumerate(protected_parts(text)):
            marker = str(987650001 + index)
            if marker in text:
                return text, []
            replacements.append((start, end, marker, text[start:end]))
        masked = text
        for start, end, marker, _ in reversed(replacements):
            masked = masked[:start] + marker + masked[end:]
        return masked, [(marker, original) for _, _, marker, original in replacements]

    report_path = Path(args.report)
    reports = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {}
    with cache_path.open("a", encoding="utf-8") as cache_file:
        for locale in args.locales.split(","):
            language = model_language(locale)
            if language == "en":
                write_json(Path(args.output) / f"{locale}.json", messages)
                continue
            supported = tokenizer.lang_code_to_token if args.model == "m2m100" else {"te", "ta", "kn", "ml"}
            if language not in supported:
                raise ValueError(f"Model does not support {locale}")
            begin = time.monotonic()
            unique = list(dict.fromkeys(messages.values()))
            pending = sorted([text for text in unique if signature(text, locale, args.beam_size) not in cache], key=len)
            translated_count = 0
            for offset in range(0, len(pending), args.batch_size):
                batch = pending[offset:offset + args.batch_size]
                masked = [mask_protected(SOURCE_HINTS.get(text, text)) for text in batch]
                translations = translate_batch([text for text, _ in masked], language)
                for text, result, (_, replacements) in zip(batch, translations, masked):
                    for marker, original in replacements:
                        result = result.replace(marker, original)
                    required = [m.group() for regex in [PLACEHOLDER, PROTECTED] for m in regex.finditer(text)]
                    placeholders_valid = sorted(PLACEHOLDER.findall(text)) == sorted(PLACEHOLDER.findall(result))
                    protected_fallback = False
                    if not placeholders_valid or any(result.count(token) != text.count(token) for token in required):
                        # A damaged setup variable, number, scope, or placeholder
                        # can change what an instruction does. Keep the source for
                        # editorial review instead of joining translated fragments.
                        result = text
                        protected_fallback = True
                    if locale in {"zh-TW", "zh-Hant", "zh-HK"}:
                        from opencc import OpenCC
                        result = OpenCC("s2t").convert(result)
                    item = {"hash": signature(text, locale, args.beam_size), "locale": locale,
                            "source": text, "translation": result, "model": MODEL_REVISION,
                            "protectedFallback": protected_fallback}
                    cache[item["hash"]] = result
                    cache_fallback[item["hash"]] = protected_fallback
                    cache_file.write(json.dumps(item, ensure_ascii=False) + "\n")
                cache_file.flush()
                translated_count += len(batch)
                elapsed = time.monotonic() - begin
                print(json.dumps({"locale": locale, "done": translated_count, "total": len(pending),
                                  "seconds": round(elapsed, 1), "stringsPerSecond": round(translated_count / elapsed, 2)}), flush=True)
            result = {key: cache[signature(text, locale, args.beam_size)] for key, text in messages.items()}
            suspicious = [key for key, text in messages.items() if suspicious_output(text, result[key])]
            for key in suspicious:
                result[key] = messages[key]
            reviewed_count = 0
            curated = json.loads(Path(args.curated_overrides).read_text(encoding="utf-8")) if Path(args.curated_overrides).exists() else {}
            safety = json.loads(Path(args.safety_overrides).read_text(encoding="utf-8")) if Path(args.safety_overrides).exists() else {}
            locale_overrides = {**curated.get(locale, {}), **safety.get(locale, {}), **overrides.get(locale, {})}
            for key, text in messages.items():
                reviewed = locale_overrides.get(text)
                if isinstance(reviewed, str) and reviewed.strip():
                    if sorted(PLACEHOLDER.findall(text)) != sorted(PLACEHOLDER.findall(reviewed)):
                        raise ValueError(f"Reviewed placeholder mismatch: {locale}/{key}")
                    result[key] = reviewed
                    reviewed_count += 1
            unchanged = [key for key, text in messages.items() if result[key].casefold() == text.casefold() and re.search(r"[A-Za-z]{3}", text)]
            mismatched = [key for key, text in messages.items() if sorted(PLACEHOLDER.findall(text)) != sorted(PLACEHOLDER.findall(result[key]))]
            empty = [key for key in messages if messages[key].strip() and not result[key].strip()]
            protected_fallbacks = [key for key, text in messages.items() if cache_fallback.get(signature(text, locale, args.beam_size)) and result[key] == text]
            write_json(Path(args.output) / f"{locale}.json", result)
            reports[locale] = {"strings": len(result), "unique": len(unique), "seconds": round(time.monotonic() - begin, 1),
                               "reviewedOverrides": reviewed_count,
                               "unchanged": unchanged, "placeholderMismatch": mismatched, "empty": empty,
                               "protectedFallbacks": protected_fallbacks,
                               "suspiciousFallbacks": [key for key in suspicious if result[key] == messages[key]],
                               "provenance": "machine-generated draft; representative review required",
                               "model": "facebook/m2m100_418M" if args.model == "m2m100" else "Helsinki-NLP/opus-mt-en-dra", "revision": MODEL_REVISION}
            write_json(report_path, reports)
            print(json.dumps({"locale": locale, "complete": True, "strings": len(result),
                              "unchanged": len(unchanged), "protectedFallbacks": len(protected_fallbacks),
                              "seconds": reports[locale]["seconds"]}, ensure_ascii=False), flush=True)
    if dll_handle:
        dll_handle.close()


if __name__ == "__main__":
    main()
