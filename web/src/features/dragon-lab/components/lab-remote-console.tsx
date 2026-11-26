import { Keyboard } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Give Guacamole a desktop-sized viewport, then scale the live frame to its card.
// CSS transforms preserve native iframe pointer coordinates and keyboard input.
export function LabRemoteConsole(props: { src: string; title: string }) {
  const { t } = useTranslation()
  const frame = useRef<HTMLIFrameElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 400, height: 210 })
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const measure = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      if (width <= 0 || height <= 0) return
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height }
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const width = Math.max(1280, size.width)
  const scale = size.width / width
  return (
    <div
      className='lab-remote-viewport'
      ref={viewport}
      onPointerEnter={() => frame.current?.contentWindow?.focus()}
    >
      {/* Only fixed same-origin Guacamole URLs are supplied by LabNode; its authenticated application requires its own origin. */}
      {/* oxlint-disable-next-line react/iframe-missing-sandbox */}
      <iframe
        ref={frame}
        className='lab-console-frame'
        src={props.src}
        title={props.title}
        style={{
          width,
          height: size.height / scale,
          transform: `scale(${scale})`,
        }}
        allowFullScreen
        referrerPolicy='same-origin'
      />
      <button
        className='lab-focus-console'
        type='button'
        aria-label={t('Focus terminal')}
        title={t('Focus terminal')}
        onClick={() => frame.current?.contentWindow?.focus()}
      >
        <Keyboard size={13} />
      </button>
    </div>
  )
}
