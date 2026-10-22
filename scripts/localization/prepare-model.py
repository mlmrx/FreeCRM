"""Prepare a local, MIT-licensed M2M100 translation model (no application data)."""

import argparse
import hashlib
import os
from pathlib import Path

MODEL = "facebook/m2m100_418M"
REVISION = "55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636"
WEIGHTS_SHA256 = "d907ea45e4e4b9db163382a6674f6218b3c59566fe06d77f4055c208b4e87ed1"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default="output/localization-tools")
    parser.add_argument("--revision", default=REVISION)
    parser.add_argument("--local-only", action="store_true", help="Convert an already downloaded official model")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(root / "hf-cache"))
    os.environ.setdefault("HF_HUB_DISABLE_IMPLICIT_TOKEN", "1")
    from huggingface_hub import snapshot_download
    import ctranslate2

    source = root / "m2m100-source"
    if not args.local_only:
        snapshot_download(
            MODEL,
            revision=args.revision,
            local_dir=source,
            token=False,
            allow_patterns=["*.json", "sentencepiece.bpe.model", "pytorch_model.bin", "README.md"],
            max_workers=3,
        )
    if args.revision == REVISION:
        with (source / "pytorch_model.bin").open("rb") as weights:
            if hashlib.file_digest(weights, "sha256").hexdigest() != WEIGHTS_SHA256:
                raise ValueError("Official model weights checksum mismatch")
    target = root / "m2m100-int8"
    if not ctranslate2.contains_model(str(target)):
        converter = ctranslate2.converters.TransformersConverter(str(source))
        converter.convert(str(target), quantization="int8")
    print(f"Ready: {target}", flush=True)


if __name__ == "__main__":
    main()
