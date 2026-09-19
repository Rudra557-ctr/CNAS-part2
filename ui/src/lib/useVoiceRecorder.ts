import { useCallback, useEffect, useRef, useState } from 'react'

// Browser-side capture for the voice assistant. The server never needs a
// microphone (and has no PyAudio): the browser records, we upload the file.
//
// Format matters — backend/api/main.py validates the upload by extension
// against ALLOWED_AUDIO_SUFFIXES, so the container we pick here and the
// filename we send must agree. Chrome and Firefox give us webm/opus; Safari
// only does mp4. Both are on the backend's accepted list.
const PREFERRED_TYPES: Array<{ mime: string; ext: string }> = [
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/webm',             ext: 'webm' },
  { mime: 'audio/mp4',              ext: 'mp4'  },   // Safari
  { mime: 'audio/ogg;codecs=opus',  ext: 'ogg'  },
  { mime: 'audio/mpeg',             ext: 'mp3'  },
]

export type RecorderState = 'idle' | 'recording' | 'processing'

export interface VoiceRecorderError {
  kind: 'unsupported' | 'permission' | 'no-device' | 'empty' | 'failed'
  message: string
}

function pickMimeType(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const candidate of PREFERRED_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate.mime)) return candidate
    } catch { /* isTypeSupported can throw on odd strings */ }
  }
  // A MediaRecorder with no supported type still records in a browser default.
  return { mime: '', ext: 'webm' }
}

export function isRecordingSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined'
}

/**
 * Records a single utterance and hands back one File.
 *
 * `onCapture` runs after the recorder flushes. State moves
 * idle → recording → processing → idle, and the caller is blocked from
 * starting a second recording until the first finishes, so a double click
 * cannot fire two uploads.
 */
export function useVoiceRecorder(onCapture: (file: File) => Promise<void> | void) {
  const [state, setState] = useState<RecorderState>('idle')
  const [error, setError] = useState<VoiceRecorderError | null>(null)
  const [seconds, setSeconds] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const tickRef = useRef<number | null>(null)

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  // A live microphone must not outlive the page.
  useEffect(() => releaseStream, [releaseStream])

  const start = useCallback(async () => {
    if (state !== 'idle') return
    setError(null)

    if (!isRecordingSupported()) {
      setError({
        kind: 'unsupported',
        message: 'This browser cannot record audio. Chrome, Edge or Firefox over '
               + 'https (or localhost) is required.',
      })
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
    } catch (e: any) {
      const name = e?.name || ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError({
          kind: 'permission',
          message: 'Microphone permission was denied. Allow access in the browser '
                 + 'address bar, then try again.',
        })
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError({ kind: 'no-device', message: 'No microphone was found on this device.' })
      } else {
        setError({ kind: 'failed', message: `Could not open the microphone: ${e?.message || name}` })
      }
      return
    }

    const picked = pickMimeType()
    streamRef.current = stream
    chunksRef.current = []

    let recorder: MediaRecorder
    try {
      recorder = picked?.mime
        ? new MediaRecorder(stream, { mimeType: picked.mime })
        : new MediaRecorder(stream)
    } catch (e: any) {
      releaseStream()
      setError({ kind: 'failed', message: `Recorder could not start: ${e?.message || e}` })
      return
    }

    recorder.ondataavailable = ev => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
    }

    recorder.onerror = () => {
      releaseStream()
      setState('idle')
      setError({ kind: 'failed', message: 'Recording failed partway through.' })
    }

    recorder.onstop = async () => {
      releaseStream()
      const ext = picked?.ext || 'webm'
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || picked?.mime || '' })
      chunksRef.current = []

      // A click-and-immediately-stop produces a header-only blob with no audio.
      if (blob.size < 1024) {
        setState('idle')
        setError({ kind: 'empty', message: 'Nothing was recorded — hold the button and speak.' })
        return
      }

      setState('processing')
      try {
        await onCapture(new File([blob], `voice-command.${ext}`, { type: blob.type }))
      } finally {
        setState('idle')
      }
    }

    recorderRef.current = recorder
    recorder.start()
    setSeconds(0)
    tickRef.current = window.setInterval(() => setSeconds(s => s + 1), 1000)
    setState('recording')
  }, [state, onCapture, releaseStream])

  const stop = useCallback(() => {
    if (state !== 'recording') return
    try {
      recorderRef.current?.stop()
    } catch {
      releaseStream()
      setState('idle')
    }
  }, [state, releaseStream])

  return {
    state,
    error,
    seconds,
    start,
    stop,
    supported: isRecordingSupported(),
    clearError: () => setError(null),
  }
}
