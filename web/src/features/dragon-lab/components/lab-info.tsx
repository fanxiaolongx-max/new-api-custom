import { Info } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Footer } from '@/components/layout/components/footer'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

export function LabInfo(props: { onCompact: (compact: boolean) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const onCompact = props.onCompact
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const collapse = useCallback(() => {
    setOpen(false)
    onCompact(true)
  }, [onCompact])
  useEffect(() => {
    return () => clearTimeout(timer.current)
  }, [])
  return (
    <div className='lab-info-dock'>
      <Popover
        open={open}
        onOpenChange={(value) => {
          clearTimeout(timer.current)
          setOpen(value)
          if (!value) onCompact(true)
        }}
      >
        <PopoverTrigger render={<Button size='sm' variant='ghost' />}>
          <Info size={14} />
          {t('Lab information')}
        </PopoverTrigger>
        <PopoverContent
          className='lab-info-panel'
          align='end'
          sideOffset={8}
          role='region'
          aria-label={t('Lab information')}
          initialFocus={false}
          finalFocus={false}
          onPointerEnter={() => clearTimeout(timer.current)}
          onFocusCapture={() => clearTimeout(timer.current)}
          onPointerLeave={(event) => {
            if (!event.currentTarget.contains(document.activeElement)) {
              clearTimeout(timer.current)
              timer.current = setTimeout(collapse, 4000)
            }
          }}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              clearTimeout(timer.current)
              timer.current = setTimeout(collapse, 4000)
            }
          }}
        >
          <PopoverTitle>{t('Lab information')}</PopoverTitle>
          <div className='lab-info-notes'>
            <p>
              {t(
                'Link colors show network roles, not measured traffic. 10G is a test target; NIC speed, LACP and reachability still require device validation.'
              )}
            </p>
            <p>
              {t(
                'The iBMC management terminal signs in automatically. The OS serial tab uses the existing real COM1 console.'
              )}
            </p>
          </div>
          <Footer columns={[]} className='lab-info-footer' />
        </PopoverContent>
      </Popover>
      <a
        className='lab-project-link'
        href='https://github.com/QuantumNous/new-api'
        target='_blank'
        rel='noopener noreferrer'
      >
        {t('New API')}
      </a>
    </div>
  )
}
