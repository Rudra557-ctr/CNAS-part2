"""
Devanagari (Hindi) support for FIR / surveillance / intelligence narratives.

Real Indian police records are frequently written in Hindi or code-mixed
Hindi-English, but `en_core_web_sm` only tags Latin-script text — a Hindi FIR
previously yielded zero entities. This module adds three offline capabilities
(no extra dependency, no model download):

  1. Digit normalisation  — Devanagari numerals (९८७६…) to ASCII so the existing
     phone / account / vehicle regexes fire on Hindi-typed records.
  2. Transliteration      — Devanagari to Roman with inherent-schwa handling,
     so "रमेश यादव" becomes "ramesh yadav" and reaches the existing RapidFuzz
     resolver instead of staying an unmatchable string.
  3. Phonetic folding     — normalises the spelling variance that survives
     transliteration (v/w, f/ph, q/k, z/j, doubled vowels), because the same
     person is written Anwar / Anvar and Sheikh / Shekh across sources.

Matching accuracy is deliberately left to the resolver: this module only makes
Hindi text comparable, it never decides identity on its own.
"""
import re
from typing import List, Optional

DEVANAGARI_RANGE = r'ऀ-ॿ'
DEVANAGARI_RE = re.compile(f'[{DEVANAGARI_RANGE}]')
DEVANAGARI_TOKEN_RE = re.compile(f'[{DEVANAGARI_RANGE}]+')

# Devanagari numerals → ASCII
_DIGITS = str.maketrans('०१२३४५६७८९', '0123456789')

# Consonants carry an inherent 'a' unless followed by a matra or virama.
_CONSONANTS = {
    'क': 'k',  'ख': 'kh', 'ग': 'g',  'घ': 'gh', 'ङ': 'ng',
    'च': 'ch', 'छ': 'chh','ज': 'j',  'झ': 'jh', 'ञ': 'ny',
    'ट': 't',  'ठ': 'th', 'ड': 'd',  'ढ': 'dh', 'ण': 'n',
    'त': 't',  'थ': 'th', 'द': 'd',  'ध': 'dh', 'न': 'n',
    'प': 'p',  'फ': 'ph', 'ब': 'b',  'भ': 'bh', 'म': 'm',
    'य': 'y',  'र': 'r',  'ल': 'l',  'व': 'v',
    'श': 'sh', 'ष': 'sh', 'स': 's',  'ह': 'h',  'ळ': 'l',
    # nukta forms (Urdu-origin sounds common in Indian names)
    'क़': 'q',  'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z',  'ड़': 'r',
    'ढ़': 'rh', 'फ़': 'f',  'य़': 'y',
}

_VOWELS = {
    'अ': 'a',  'आ': 'aa', 'इ': 'i',  'ई': 'ii', 'उ': 'u', 'ऊ': 'uu',
    'ऋ': 'ri', 'ए': 'e',  'ऐ': 'ai', 'ओ': 'o',  'औ': 'au',
}

_MATRAS = {
    'ा': 'aa', 'ि': 'i', 'ी': 'ii', 'ु': 'u', 'ू': 'uu',
    'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
}

_VIRAMA = '्'
_NUKTA = '़'
_ANUSVARA = {'ं': 'n', 'ँ': 'n', 'ः': 'h'}

# Hindi function words and police boilerplate — never person names.
_STOP_TOKENS = {
    # postpositions / particles — these sit right next to names and would
    # otherwise be glued on ("यादव ने") or matched on their own
    'ने', 'को', 'से', 'का', 'की', 'के', 'में', 'पर', 'ही', 'भी', 'तो', 'और',
    'व', 'या', 'तक', 'लिए', 'साथ', 'पास', 'बिना', 'वाले', 'वाला',
    'है', 'था', 'थी', 'थे', 'हैं', 'हुआ', 'हुई', 'हुए', 'किया', 'करता',
    'गया', 'गई', 'गए', 'दिया', 'लिया', 'कर', 'करने', 'रहा', 'रही', 'देखा',
    'यह', 'वह', 'इस', 'उस', 'जो', 'तथा', 'द्वारा', 'बाद', 'पहले', 'दौरान',
    'दोनों', 'अज्ञात', 'व्यक्ति', 'नाम', 'उक्त', 'अनुसार', 'विरुद्ध',
    'थाना', 'पुलिस', 'रिपोर्ट', 'धारा', 'मामला', 'प्राथमिकी', 'अपराध',
    'दिनांक', 'समय', 'स्थान', 'क्षेत्र', 'शहर', 'गाँव', 'रुपये', 'रूपये',
    'लाख', 'हजार', 'करोड़', 'नकद', 'खाता', 'मोबाइल', 'फोन', 'नंबर',
    'सूचना', 'बयान', 'गवाह', 'जांच', 'गिरफ्तार', 'बरामद', 'मुलाकात', 'संपर्क',
}

# Two-character Devanagari runs are almost always particles, not names.
_MIN_NAME_CHARS = 3

# Words that introduce a person in Hindi police prose.
_PERSON_CUES = ('आरोपी', 'अभियुक्त', 'संदिग्ध', 'शिकायतकर्ता', 'फरियादी',
                'श्री', 'श्रीमती', 'नामक', 'मुखबिर')

# Hindi verb cues → the relationship kinds the extractor already emits.
RELATION_CUES = (
    (('मुलाकात', 'मिला', 'मिले', 'मिलकर', 'बैठक'), 'MET', 0.70),
    (('भेजे', 'भेजा', 'ट्रांसफर', 'भुगतान', 'हस्तांतरित', 'जमा'), 'TRANSFERRED_TO', 0.65),
    (('फोन', 'कॉल', 'संपर्क', 'बातचीत'), 'CALLS', 0.72),
    (('काम', 'नौकर', 'सदस्य', 'गिरोह'), 'WORKS_FOR', 0.62),
    (('मालिक', 'स्वामित्व', 'पंजीकृत'), 'OWNS', 0.60),
    (('संबंध', 'जुड़ा', 'संलिप्त', 'साथी'), 'ASSOCIATED_WITH', 0.62),
)


def has_devanagari(text: str) -> bool:
    return bool(text) and bool(DEVANAGARI_RE.search(text))


def normalize_digits(text: str) -> str:
    """Devanagari numerals to ASCII so phone/account regexes match Hindi records."""
    return text.translate(_DIGITS) if text else text


def transliterate(text: str) -> str:
    """
    Devanagari → Roman, applying word-final schwa deletion (Hindi drops the
    inherent 'a': रमेश is "ramesh", not "ramesha"). Latin characters pass through
    unchanged so code-mixed text stays readable.
    """
    if not text:
        return ''
    out: List[str] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ''
        # consonant + nukta is a single letter (क़, ज़, ड़ …)
        if nxt == _NUKTA and (ch + _NUKTA) in _CONSONANTS:
            cons, i = _CONSONANTS[ch + _NUKTA], i + 2
        elif ch in _CONSONANTS:
            cons, i = _CONSONANTS[ch], i + 1
        else:
            cons = None
        if cons is not None:
            out.append(cons)
            follow = text[i] if i < n else ''
            if follow in _MATRAS:
                out.append(_MATRAS[follow]); i += 1
            elif follow == _VIRAMA:
                i += 1  # conjunct — no vowel at all
            else:
                out.append('a')  # inherent schwa
            continue
        if ch in _VOWELS:
            out.append(_VOWELS[ch]); i += 1; continue
        if ch in _ANUSVARA:
            out.append(_ANUSVARA[ch]); i += 1; continue
        if ch in _MATRAS or ch in (_VIRAMA, _NUKTA):
            i += 1; continue  # stray mark
        out.append(ch); i += 1

    roman = ''.join(out)
    # Word-final schwa deletion, per word.
    return ' '.join(
        w[:-1] if len(w) > 2 and w.endswith('a') and not w.endswith('aa') else w
        for w in roman.split(' ')
    )


def fold_phonetic(name: str) -> str:
    """
    Collapse the spelling variance that survives transliteration, so
    "Anwar"/"anavar" and "Sheikh"/"shekh" land close enough for RapidFuzz.
    Used on BOTH sides of a comparison — never stored as the entity value.
    """
    if not name:
        return ''
    s = name.strip().lower()
    s = re.sub(r'[^a-z\s]', '', s)
    for a, b in (('w', 'v'), ('f', 'ph'), ('q', 'k'), ('z', 'j'), ('x', 'ks')):
        s = s.replace(a, b)
    for long_v, short_v in (('aa', 'a'), ('ii', 'i'), ('ee', 'i'),
                            ('uu', 'u'), ('oo', 'u')):
        s = s.replace(long_v, short_v)
    s = re.sub(r'(.)\1+', r'\1', s)          # doubled letters: pillai / pilai
    return re.sub(r'\s+', ' ', s).strip()


def romanize_for_match(name: str) -> str:
    """Transliterate if Devanagari, then fold. Safe to call on Latin text."""
    return fold_phonetic(transliterate(name) if has_devanagari(name) else name)


def infer_hindi_relation(sentence: str) -> Optional[tuple]:
    """(kind, confidence) if a Hindi relationship cue is present, else None."""
    for cues, kind, conf in RELATION_CUES:
        if any(c in sentence for c in cues):
            return kind, conf
    return None


def extract_person_mentions(text: str, known_names: Optional[List[str]] = None) -> List[dict]:
    """
    Candidate person mentions from Hindi text, via two passes:

      cue    — a Devanagari token run directly after आरोपी / श्री / नामक …
               (high precision, works for people absent from the directory)
      gazette— a token run whose romanised form matches a known canonical name
               token (catches mentions that carry no cue word)

    Returns [{value, roman, confidence, extractor}]. Identity is NOT decided
    here — the resolver still has to clear its own threshold.
    """
    if not has_devanagari(text):
        return []
    known_tokens = {
        fold_phonetic(part)
        for name in (known_names or [])
        for part in name.split()
        if len(part) > 2
    }

    found: dict = {}
    tokens = [(m.group(), m.start(), m.end()) for m in DEVANAGARI_TOKEN_RE.finditer(text)]

    for idx, (tok, start, end) in enumerate(tokens):
        if tok in _STOP_TOKENS or len(tok) < _MIN_NAME_CHARS:
            continue
        cue_before = idx > 0 and any(tokens[idx - 1][0].startswith(c) for c in _PERSON_CUES)
        nxt = tokens[idx + 1] if idx + 1 < len(tokens) else None
        pair_ok = bool(nxt and nxt[0] not in _STOP_TOKENS
                       and len(nxt[0]) >= _MIN_NAME_CHARS and nxt[1] - end <= 2)

        # Prefer the two-token form (given name + surname) when available.
        value = f'{tok} {nxt[0]}' if (cue_before and pair_ok) else tok
        roman = transliterate(value)

        if cue_before:
            found[value] = {'value': value, 'roman': roman,
                            'confidence': 0.62, 'extractor': 'devanagari_cue'}
            continue
        if fold_phonetic(transliterate(tok)) in known_tokens:
            pair = f'{tok} {nxt[0]}' if pair_ok else tok
            found.setdefault(pair, {'value': pair, 'roman': transliterate(pair),
                                    'confidence': 0.55, 'extractor': 'devanagari_gazetteer'})
    return list(found.values())
