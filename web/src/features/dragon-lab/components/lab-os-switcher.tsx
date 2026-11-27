import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// Steps through the OS guests that share the iBMC / OS card positions.
export function LabOSSwitcher(props: {
  names: string[]
  current: string
  onChange: (name: string, direction: 'next' | 'prev') => void
}) {
  const { t } = useTranslation()
  const index = Math.max(0, props.names.indexOf(props.current))
  const step = (offset: 1 | -1) => {
    const count = props.names.length
    props.onChange(
      props.names[(index + offset + count) % count],
      offset > 0 ? 'next' : 'prev'
    )
  }
  return (
    <div
      className='lab-os-switcher'
      role='group'
      aria-label={t('Switch OS node')}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') step(1)
        else if (event.key === 'ArrowLeft') step(-1)
        else return
        event.preventDefault()
      }}
    >
      <button
        type='button'
        aria-label={t('Previous node')}
        onClick={() => step(-1)}
      >
        <ChevronLeft size={13} />
      </button>
      <span aria-live='polite'>
        {props.names[index]}
        <small>
          {index + 1}/{props.names.length}
        </small>
      </span>
      <button type='button' aria-label={t('Next node')} onClick={() => step(1)}>
        <ChevronRight size={13} />
      </button>
    </div>
  )
}
