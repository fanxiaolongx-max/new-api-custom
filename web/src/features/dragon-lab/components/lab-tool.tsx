import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, Settings2, X } from 'lucide-react'
import { useId, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import {
  getLabTool,
  LAB_KEY,
  saveLabConfig,
  type LabConfig,
  type LabOSInstance,
} from '../api'

export default function LabTool(props: {
  instances?: LabOSInstance[]
  config: LabConfig
  onClose: () => void
  onDetach?: () => void
  open?: boolean
  frame?: RefObject<HTMLIFrameElement | null>
  onFrameLoad?: () => void
  running?: boolean
}) {
  const { t } = useTranslation()
  const titleID = useId()
  const localFrame = useRef<HTMLIFrameElement>(null)
  const isOpen = props.open ?? true
  const client = useQueryClient()
  const remoteURL = props.config.workbench_url || ''
  const [editing, setEditing] = useState(false)
  const [draftURL, setDraftURL] = useState(remoteURL)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const mutation = useMutation({
    mutationFn: saveLabConfig,
    onSuccess: (config) => {
      client.setQueryData(LAB_KEY, config)
      setEditing(false)
    },
  })
  const query = useQuery({
    queryKey: ['system', 'dragon-lab-tool'],
    queryFn: getLabTool,
    enabled: !remoteURL,
    staleTime: Infinity,
    retry: false,
  })
  const download = () => {
    if (!query.data) return
    const url = URL.createObjectURL(
      new Blob([query.data], { type: 'text/html;charset=utf-8' })
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'TaiSha.html'
    a.click()
    URL.revokeObjectURL(url)
  }
  const openTab = () => {
    const tab = window.open(remoteURL, '_blank')
    if (!tab) {
      setPopupBlocked(true)
      return
    }
    tab.opener = null
    ;(props.onDetach ?? props.onClose)()
  }
  // A configured cross-origin page retains its own authentication and storage.
  // Same-origin custom pages and the uploaded HTML keep an opaque sandbox.
  const remoteSandbox =
    remoteURL && new URL(remoteURL).origin !== window.location.origin
      ? 'allow-scripts allow-forms allow-downloads allow-modals allow-same-origin'
      : 'allow-scripts allow-forms allow-downloads allow-modals'
  return (
    <section
      className={`lab-tool-dialog ${isOpen ? 'is-open' : 'is-hidden'}`}
      role={isOpen ? 'dialog' : undefined}
      aria-modal={isOpen ? false : undefined}
      aria-labelledby={titleID}
      aria-hidden={!isOpen}
      inert={!isOpen}
      onKeyDown={(event) => {
        if (event.key === 'Escape') props.onClose()
      }}
    >
      <header className='lab-tool-header'>
        <div>
          <h2 id={titleID}>{t('Script workbench')}</h2>
          <p>
            {remoteURL
              ? t(
                  'The connected workbench handles device operations using its saved configuration.'
                )
              : t(
                  'Generate scripts in this isolated tool, then run them inside win7. This page does not execute deployment commands.'
                )}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={!remoteURL || props.running}
            onClick={openTab}
          >
            <ExternalLink size={14} />
            {t('Open in new tab')}
          </Button>
          <Button
            size='icon-sm'
            variant='ghost'
            onClick={props.onClose}
            aria-label={t('Close')}
          >
            <X size={16} />
          </Button>
        </div>
      </header>
      <div className='flex items-center gap-2'>
        <Button
          size='sm'
          variant='outline'
          onClick={() => setEditing((value) => !value)}
          aria-expanded={editing}
        >
          <Settings2 size={14} />
          {t('Workbench address')}
        </Button>
        {props.instances?.map((instance) => (
          <Button
            key={instance.name}
            size='sm'
            variant='outline'
            disabled={props.running}
            onClick={() => {
              const os = instance.nodes.find((n) => n.id === 'os')
              const mgmt = instance.links.find((link) => link.id === 'sw1-ibmc')
              const ibmc = instance.nodes.find((n) => n.id === 'ibmc')
              if (!os || !mgmt || !ibmc) return
              const [ip, prefix] = os.address.split('/')
              const frame = (
                remoteURL ? (props.frame ?? localFrame) : localFrame
              ).current
              frame?.contentWindow?.postMessage(
                {
                  source: 'dragon-lab',
                  version: 1,
                  type: 'prefill-host',
                  channel: crypto.randomUUID(),
                  fields: {
                    ehHostname: instance.name,
                    ehMgmtPort: mgmt.source_port,
                    ehOsIp: ip,
                    ehPrefix: prefix,
                    ehOsGw: os.gateway,
                    ehIbmcIp: ibmc.address.split('→').at(-1)?.trim(),
                  },
                },
                remoteURL && remoteSandbox.includes('allow-same-origin')
                  ? new URL(remoteURL).origin
                  : '*'
              )
            }}
          >
            {t('Add')} {instance.name}
          </Button>
        ))}
        {!remoteURL && (
          <Button
            size='sm'
            variant='outline'
            onClick={download}
            disabled={!query.data}
          >
            <Download size={14} />
            {t('Download original HTML')}
          </Button>
        )}
      </div>
      {editing && (
        <form
          className='flex flex-wrap items-end gap-2'
          onSubmit={(event) => {
            event.preventDefault()
            if (props.running) return
            mutation.mutate({
              ...props.config,
              workbench_url: draftURL.trim(),
            })
          }}
        >
          <label className='min-w-64 flex-1 space-y-1 text-xs'>
            {t('Workbench address')}
            <Input
              type='url'
              value={draftURL}
              maxLength={4096}
              autoComplete='off'
              placeholder='https://example.com/tool'
              onChange={(event) => setDraftURL(event.target.value)}
            />
          </label>
          <Button
            type='submit'
            size='sm'
            disabled={mutation.isPending || props.running}
          >
            {t('Save changes')}
          </Button>
          <p className='text-muted-foreground w-full text-xs'>
            {t('Leave blank to use the bundled HTML tool.')}
          </p>
        </form>
      )}
      {mutation.isError && (
        <p role='alert'>{t('Unable to save workbench address')}</p>
      )}
      {popupBlocked && (
        <p role='alert'>
          {t('Allow pop-ups to open the workbench in a new tab.')}
        </p>
      )}
      {remoteURL ? (
        <iframe
          className='lab-tool-frame'
          title={t('Script workbench')}
          ref={props.frame ?? localFrame}
          onLoad={props.onFrameLoad}
          src={remoteURL}
          sandbox={remoteSandbox}
          referrerPolicy='no-referrer'
        />
      ) : (
        <>
          {query.isPending && <p role='status'>{t('Loading...')}</p>}
          {query.isError && (
            <p role='alert'>{t('Unable to load the script workbench')}</p>
          )}
          {query.data && (
            <iframe
              className='lab-tool-frame'
              title={t('Isolated TaiSha script generator')}
              ref={localFrame}
              srcDoc={
                query.data +
                '<script src="' +
                window.location.origin +
                '/dragon-lab-workbench-bridge.js"></script>'
              }
              sandbox='allow-scripts allow-forms allow-downloads allow-modals'
              referrerPolicy='no-referrer'
            />
          )}
        </>
      )}
    </section>
  )
}
