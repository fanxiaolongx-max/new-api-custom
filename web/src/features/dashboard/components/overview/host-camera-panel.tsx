import { Camera, CameraOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { getFreshAuthHeaders } from '@/lib/api'

const MEDIA_TYPE = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'

type CameraStatus = 'off' | 'connecting' | 'live' | 'error'

export function HostCameraPanel() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(true)
  const [status, setStatus] = useState<CameraStatus>('connecting')
  const videoRef = useRef<HTMLVideoElement>(null)
  const failuresRef = useRef(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const video = videoRef.current
    if (
      !video ||
      !window.MediaSource ||
      !MediaSource.isTypeSupported(MEDIA_TYPE)
    ) {
      setStatus('error')
      return
    }
    const abort = new AbortController()
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let canRetry = true
    const media = new MediaSource()
    const url = URL.createObjectURL(media)
    video.src = url
    setStatus('connecting')

    const start = async () => {
      try {
        const headers = await getFreshAuthHeaders()
        const response = await fetch('/api/system/camera/stream', {
          headers,
          cache: 'no-store',
          signal: abort.signal,
        })
        if (!response.ok || !response.body) {
          canRetry = response.status !== 401 && response.status !== 403
          throw new Error('Stream unavailable')
        }
        const source = media.addSourceBuffer(MEDIA_TYPE)
        const reader = response.body.getReader()
        let playbackStarted = false
        const update = () =>
          new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              source.removeEventListener('updateend', onEnd)
              source.removeEventListener('error', onError)
            }
            const onEnd = () => {
              cleanup()
              resolve()
            }
            const onError = () => {
              cleanup()
              reject(new Error('Media error'))
            }
            source.addEventListener('updateend', onEnd, { once: true })
            source.addEventListener('error', onError, { once: true })
          })
        while (!abort.signal.aborted) {
          const chunk = await reader.read()
          if (chunk.done) throw new Error('Stream ended')
          source.appendBuffer(chunk.value as Uint8Array<ArrayBuffer>)
          await update()
          if (source.buffered.length) {
            const end = source.buffered.end(source.buffered.length - 1)
            if (end - video.currentTime > 4) video.currentTime = end - 1
            if (
              video.currentTime > 20 &&
              source.buffered.start(0) < video.currentTime - 15
            ) {
              source.remove(source.buffered.start(0), video.currentTime - 15)
              await update()
            }
            failuresRef.current = 0
            setStatus('live')
            if (!playbackStarted) {
              playbackStarted = true
              void video.play().catch(() => {})
            }
          }
        }
      } catch {
        if (!abort.signal.aborted) {
          abort.abort()
          if (canRetry && failuresRef.current < 4) {
            failuresRef.current += 1
            setStatus('connecting')
            retryTimer = setTimeout(
              () => setAttempt((value) => value + 1),
              1500
            )
          } else {
            setStatus('error')
          }
        }
      }
    }
    media.addEventListener('sourceopen', start, { once: true })
    return () => {
      abort.abort()
      if (retryTimer) clearTimeout(retryTimer)
      video.pause()
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
    }
  }, [enabled, attempt])

  let placeholder = t('Camera and microphone are off')
  if (status === 'connecting') placeholder = t('Connecting to camera…')
  if (status === 'error') placeholder = t('Camera or microphone unavailable')

  return (
    <section
      aria-label={t('Host camera')}
      className='flex min-h-48 flex-col gap-2 border-t p-3 sm:p-4 xl:border-t-0 xl:border-l'
    >
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2 text-sm font-semibold'>
          <Camera className='size-4 text-sky-500' aria-hidden='true' />
          {t('Host camera')}
          {status === 'live' && (
            <span className='text-success text-xs'>● {t('Live')}</span>
          )}
        </div>
        <Button
          size='sm'
          variant='outline'
          onClick={() => {
            setEnabled(!enabled)
            failuresRef.current = 0
            if (enabled) setStatus('off')
          }}
        >
          {enabled ? t('Stop') : t('Start')}
        </Button>
      </div>
      <div className='bg-background relative flex min-h-32 flex-1 items-center justify-center overflow-hidden rounded-xl'>
        {enabled && (
          <video
            ref={videoRef}
            className='h-full max-h-48 w-full object-contain'
            autoPlay
            muted
            playsInline
            controls
            aria-label={t('Live camera and microphone')}
          />
        )}
        {status !== 'live' && (
          <div className='text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-3 text-center text-xs'>
            <CameraOff className='size-5' aria-hidden='true' />
            {placeholder}
            {status === 'error' && (
              <Button
                size='sm'
                variant='outline'
                onClick={() => {
                  failuresRef.current = 0
                  setAttempt((value) => value + 1)
                }}
              >
                {t('Retry')}
              </Button>
            )}
          </div>
        )}
      </div>
      <p className='text-muted-foreground text-[11px]'>
        {t('Audio starts muted. Use the player controls to hear it.')}
      </p>
    </section>
  )
}
