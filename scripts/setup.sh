#!/usr/bin/env bash
# Fresh-machine setup for CNAS.
# The spaCy language model is NOT on PyPI under requirements.txt, so a plain
# `pip install -r requirements.txt` silently leaves real-location extraction
# disabled (the extractor falls back to the synthetic gazetteer). This script
# installs everything, including the model.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 -m pip install -r requirements.txt
python3 -m spacy download en_core_web_sm

python3 -c "
import spacy
nlp = spacy.load('en_core_web_sm')
doc = nlp('Meeting near Andheri station in Mumbai.')
print('spaCy OK:', [(e.text, e.label_) for e in doc.ents])
"

echo "Setup complete. Start the API with:"
echo "  python3 -m uvicorn backend.api.main:app --port 8000"
