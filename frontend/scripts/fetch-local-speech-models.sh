#!/bin/sh
# Restore the on-device Whisper and Kokoro files used by the speech-local-models tag.
# Git does not store these weights. Run this from frontend/ after checking out that tag.
set -e
root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)/public/models"
mirror="https://hf-mirror.com"
fetch() {
  repo="$1"
  file="$2"
  dest="$root/$repo/$file"
  mkdir -p "$(dirname "$dest")"
  echo "get $repo/$file"
  curl -fL --retry 3 --retry-delay 2 -o "$dest" "$mirror/$repo/resolve/main/$file"
}
fetch "Xenova/whisper-tiny" "config.json"
fetch "Xenova/whisper-tiny" "generation_config.json"
fetch "Xenova/whisper-tiny" "preprocessor_config.json"
fetch "Xenova/whisper-tiny" "tokenizer.json"
fetch "Xenova/whisper-tiny" "tokenizer_config.json"
fetch "Xenova/whisper-tiny" "added_tokens.json"
fetch "Xenova/whisper-tiny" "special_tokens_map.json"
fetch "Xenova/whisper-tiny" "merges.txt"
fetch "Xenova/whisper-tiny" "vocab.json"
fetch "Xenova/whisper-tiny" "normalizer.json"
fetch "Xenova/whisper-tiny" "onnx/encoder_model_quantized.onnx"
fetch "Xenova/whisper-tiny" "onnx/decoder_model_merged_quantized.onnx"
fetch "onnx-community/Kokoro-82M-v1.0-ONNX" "config.json"
fetch "onnx-community/Kokoro-82M-v1.0-ONNX" "tokenizer.json"
fetch "onnx-community/Kokoro-82M-v1.0-ONNX" "tokenizer_config.json"
fetch "onnx-community/Kokoro-82M-v1.0-ONNX" "onnx/model_quantized.onnx"
echo "models are in $root"
