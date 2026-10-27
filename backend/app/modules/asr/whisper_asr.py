import logging
from threading import Lock
from dataclasses import dataclass
from functools import lru_cache
from typing import List, Optional

import numpy as np

logger = logging.getLogger("talkbridge.asr.whisper")
_ASR_INFER_LOCK = Lock()


@dataclass(frozen=True)
class Transcript:
    text: str


@lru_cache(maxsize=4)
def _load_model(model_name: str):
    import whisper  # local import (heavy)

    logger.info("loading_whisper_model name=%s", model_name)
    return whisper.load_model(model_name)


def _pick_model(base_name: str, language: Optional[str]) -> str:
    # `tiny.en` / `base.en` are ~1.5x faster than their multilingual peers
    # when we know the source is English.
    if language == "en" and base_name in {"tiny", "base", "small"} and not base_name.endswith(".en"):
        return f"{base_name}.en"
    # Hindi on `tiny` multilingual is notoriously poor — promote to `base` so
    # short phone-call phrases get a usable transcript. `base` is still CPU-fast
    # (~250-450 ms per 1-s segment on Apple Silicon).
    if language == "hi" and base_name == "tiny":
        return "base"
    return base_name


# Whisper on near-silent or very short audio tends to emit these canned
# strings regardless of what was said. Filtering them before translation
# stops fake "thank you" / "شुक्रिया" bubbles from polluting the transcript.
_HALLUCINATION_PHRASES = {
    "en": {
        "thanks for watching.", "thanks for watching!", "(music)", "[music]", 
        "(silence)", "[silence]", "subscribe.", "see you next time."
    },
    "hi": set(),
}


def _clean_transcript(text: str, language: Optional[str]) -> str:
    """Strip Whisper hallucinations and stuck-token repeats."""
    t = (text or "").strip()
    if not t:
        return ""

    lang = (language or "").lower()
    norm = t.lower().strip().strip('"\'“”‘’')
    if norm in _HALLUCINATION_PHRASES.get(lang, set()):
        return ""

    words = t.split()
    # "you you you", "the the the" — stuck-token loops.
    if len(words) >= 3 and len({w.lower().strip(".,!?") for w in words[:4]}) == 1:
        return ""
    # Single punctuation.
    if len(t) <= 1 and t in {".", ",", "!", "?", "-", "—", "–", "…"}:
        return ""
    # Reject repeated same-character gibberish like "aaaaaa".
    if len(t) >= 8:
        compact = "".join(ch for ch in t if ch.isalpha() or ("\u0900" <= ch <= "\u097f"))
        if compact:
            uniq = len(set(compact))
            if uniq <= 2 and (len(compact) / max(uniq, 1)) >= 4:
                return ""

    return t


def transcribe_16k_mono_f32(
    audio_f32: np.ndarray,
    *,
    model_name: str = "tiny",
    language: Optional[str] = None,
) -> Transcript:
    """Transcribe 16kHz mono float32 audio with Whisper.

    This is a synchronous, CPU-heavy call (run in a thread from async code).
    """
    if audio_f32.ndim != 1:
        raise ValueError("audio_f32 must be mono 1D array")
    if audio_f32.size == 0:
        return Transcript(text="")

    # Defensive sanitization: streaming buffers can occasionally carry NaN/Inf
    # or near-silent noise that destabilizes Whisper decoding on CPU.
    audio_f32 = np.nan_to_num(audio_f32.astype(np.float32, copy=False), nan=0.0, posinf=0.0, neginf=0.0)
    rms = float(np.sqrt(np.mean(np.square(audio_f32)))) if audio_f32.size else 0.0
    if rms < 0.003:
        return Transcript(text="")
    # Whisper is more stable with at least ~1 second context.
    if audio_f32.size < 16000:
        audio_f32 = np.pad(audio_f32, (0, 16000 - audio_f32.size), mode="constant")

    model = _load_model(_pick_model(model_name, language))
    # Nudge Whisper toward the caller's language when we know it. The prompt
    # is short enough to add no measurable latency.
    initial_prompt = None
    if language == "hi":
        initial_prompt = "यह एक फ़ोन कॉल पर आम बातचीत है।"
    elif language == "en":
        initial_prompt = "This is a casual phone conversation."

    # Greedy decoding (no beam search) cuts decode time roughly in half with
    # negligible quality impact on short phone-call segments.
    # Whisper/Torch model objects are not reliably thread-safe on Windows CPU.
    # Serializing decode calls avoids native crashes under two-way live calls.
    with _ASR_INFER_LOCK:
        try:
            result = model.transcribe(
                audio_f32,
                fp16=False,
                language=language,
                beam_size=1,
                best_of=1,
                without_timestamps=True,
                condition_on_previous_text=False,
                no_speech_threshold=0.6,
                logprob_threshold=-1.0,
                compression_ratio_threshold=2.4,
                initial_prompt=initial_prompt,
            )
        except RuntimeError as e:
            # Work around occasional empty-token decode edge cases in Whisper+Torch.
            if "cannot reshape tensor of 0 elements" not in str(e):
                raise
            logger.warning("whisper_retry_after_empty_decode model=%s", model_name)
            padded = np.pad(audio_f32, (0, 16000), mode="constant")
            result = model.transcribe(
                padded,
                fp16=False,
                language=language,
                beam_size=1,
                best_of=1,
                without_timestamps=True,
                condition_on_previous_text=False,
                no_speech_threshold=0.6,
                logprob_threshold=-1.0,
                compression_ratio_threshold=2.4,
                initial_prompt=initial_prompt,
            )
    text = _clean_transcript(result.get("text") or "", language)
    return Transcript(text=text)


def warmup_whisper(models: Optional[List[str]] = None) -> None:
    """Preload Whisper weights so the first segment doesn't pay the load cost."""
    models = models or ["tiny", "tiny.en"]
    for m in models:
        try:
            _load_model(m)
            logger.info("whisper_warmup_ok model=%s", m)
        except Exception as e:
            logger.warning("whisper_warmup_failed model=%s error=%s", m, e)

