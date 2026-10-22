"""Prepare the publisher's Apache-2.0 English to Dravidian model for Telugu."""

import argparse
import hashlib
from pathlib import Path
import subprocess

MODEL = "Helsinki-NLP/opus-mt-en-dra"
REVISION = "5ecfd223f954f860b67f1b4c42e6f4c70d347581"
WEIGHTS_SHA256 = "a632ff7f2207847878079b87bc6ec2fdeb5a8d0a436ae5d92fec4892c7026652"
FILES = ["config.json", "generation_config.json", "tokenizer_config.json", "vocab.json",
         "source.spm", "target.spm", "README.md", "pytorch_model.bin"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default="output/localization-tools")
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--local-only", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    source = root / "opus-en-dra-source"
    source.mkdir(parents=True, exist_ok=True)
    if not args.local_only:
        for filename in FILES:
            path = source / filename
            if path.exists() and path.stat().st_size:
                continue
            subprocess.run(["curl", "--location", "--fail", "--silent", "--show-error", "--retry", "2",
                            "--max-time", "600", "--output", str(path),
                            f"https://huggingface.co/{MODEL}/resolve/{REVISION}/{filename}"], check=True)
            print(f"Downloaded {filename}", flush=True)
    with (source / "pytorch_model.bin").open("rb") as weights:
        if hashlib.file_digest(weights, "sha256").hexdigest() != WEIGHTS_SHA256:
            raise ValueError("Official model weights checksum mismatch")
    if not args.download_only:
        import ctranslate2
        target = root / "opus-en-dra-int8"
        if not ctranslate2.contains_model(str(target)):
            ctranslate2.converters.TransformersConverter(str(source)).convert(str(target), quantization="int8")
        print(f"Ready: {target}", flush=True)


if __name__ == "__main__":
    main()
