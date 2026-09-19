"""
Investigator voice assistant — offline speech to structured investigative filters.

Pipeline: audio → transcriber (faster-whisper, local) → parser → nlq.Intent →
the same execute/summarise path the text interface uses.

Every import here is lazy. Whisper pulls ctranslate2 and PyAudio needs a system
audio library; neither is required to serve the rest of the API, so a missing
voice dependency must never stop `backend.api.main` from importing.
"""
