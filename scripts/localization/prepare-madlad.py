"""Download a pinned, Apache-2.0 MADLAD CT2 conversion for local quality trials.

The converter is published by Nextcloud, not Google. No repository code executes;
only fixed model data and tokenizer files are downloaded. The largest artifacts
have publisher-provided SHA-256 values. No credentials or remote inference used.
"""

import argparse
import hashlib
from pathlib import Path
import shutil
import subprocess

MODEL = "Nextcloud-AI/madlad400-3b-mt-ct2-int8"
REVISION = "aa32bbdeba7880eff2096ec044cb155a340a9400"
FILES = {
    "README.md": None,
    "added_tokens.json": None,
    "config.json": None,
    "generation_config.json": None,
    "shared_vocabulary.json": None,
    "special_tokens_map.json": None,
    "spiece.model": "ef11ac9a22c7503492f56d48dce53be20e339b63605983e9f27d2cd0e0f3922c",
    "tokenizer.json": "a2799ccc696b752ba00c34f58726bfe253a04921ceb6cfc620400f560474790b",
    "tokenizer_config.json": None,
    "model.bin": "77b9fd9ab97c1259d07089b5f854393dad81bc5fb5647d3f9a5d101c94f40daa",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default="output/localization-tools")
    args = parser.parse_args()
    target = Path(args.root).resolve() / "madlad-int8"
    target.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(target).free < 6_000_000_000:
        raise RuntimeError("Need 6 GB of free space for the bounded model download")
    for filename, expected_hash in FILES.items():
        path = target / filename
        if not path.exists():
            temporary = path.with_suffix(path.suffix + ".part")
            print(f"Downloading {filename}", flush=True)
            resume = ["--continue-at", "-"] if temporary.exists() else []
            subprocess.run([
                "curl", "--location", "--fail", "--silent", "--show-error",
                "--max-time", "900", *resume, "--output", str(temporary),
                f"https://huggingface.co/{MODEL}/resolve/{REVISION}/{filename}",
            ], check=True)
            temporary.replace(path)
        if expected_hash:
            with path.open("rb") as file:
                actual = hashlib.file_digest(file, "sha256").hexdigest()
            if actual != expected_hash:
                raise ValueError(f"Model artifact checksum mismatch: {filename}")
        print(f"Verified {filename} ({path.stat().st_size:,} bytes)", flush=True)
    print(f"Ready: {target}", flush=True)


if __name__ == "__main__":
    main()
