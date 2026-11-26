import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  LAB_KEY,
  saveLabConfig,
  type LabConfig,
  type LabNodeConfig,
  type LabLinkConfig,
} from '../api'
import { LAB_LINKS, LAB_NODES } from '../topology'

export default function LabSettings(props: {
  config: LabConfig
  onClose: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [draft, setDraft] = useState(() => structuredClone(props.config))
  const mutation = useMutation({
    mutationFn: saveLabConfig,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: LAB_KEY })
      toast.success(t('Lab topology saved'))
      props.onClose()
    },
  })
  const updateNode = (
    id: string,
    key: keyof LabNodeConfig,
    value: string | number
  ) =>
    setDraft((previous) => ({
      ...previous,
      nodes: previous.nodes.map((node) =>
        node.id === id ? { ...node, [key]: value } : node
      ),
    }))
  const updateLink = (id: string, key: keyof LabLinkConfig, value: string) =>
    setDraft((previous) => ({
      ...previous,
      links: previous.links.map((link) =>
        link.id === id ? { ...link, [key]: value } : link
      ),
    }))
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) props.onClose()
      }}
    >
      <DialogContent className='max-h-[92dvh] w-[94vw] max-w-4xl! overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t('Lab connections & port labels')}</DialogTitle>
          <DialogDescription>
            {t(
              'These settings bind existing consoles and annotate the plan. They do not change device IPs, VLANs or VM networking.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate(draft)
          }}
          className='space-y-4'
        >
          <Tabs defaultValue='nodes'>
            <TabsList>
              <TabsTrigger value='nodes'>{t('Device consoles')}</TabsTrigger>
              <TabsTrigger value='links'>{t('Ports & addressing')}</TabsTrigger>
            </TabsList>
            <TabsContent value='nodes'>
              <p className='lab-tool-note mb-3'>
                {t(
                  'Use an existing Guacamole connection ID. Permissions are unchanged. The SOL fallback is real COM1, not an iBMC SSH prompt.'
                )}
              </p>
              {draft.nodes.map((node) => (
                <section className='lab-settings-block' key={node.id}>
                  <h3>
                    {t(
                      LAB_NODES.find((item) => item.id === node.id)?.title ??
                        node.id
                    )}
                  </h3>
                  <div className='lab-settings-grid'>
                    <label>
                      {t('Planned address')}
                      <Input
                        value={node.address}
                        maxLength={160}
                        onChange={(event) =>
                          updateNode(node.id, 'address', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      {t('Default gateway')}
                      <Input
                        value={node.gateway}
                        maxLength={80}
                        onChange={(event) =>
                          updateNode(node.id, 'gateway', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      {t('Console binding')}
                      <NativeSelect
                        value={node.console_mode}
                        onChange={(event) =>
                          updateNode(
                            node.id,
                            'console_mode',
                            event.target.value
                          )
                        }
                      >
                        <NativeSelectOption value='pending'>
                          {t('Awaiting setup')}
                        </NativeSelectOption>
                        <NativeSelectOption value='remote'>
                          {t('Registered remote console')}
                        </NativeSelectOption>
                        {node.id === 'ibmc' && (
                          <NativeSelectOption value='sol'>
                            {t('Existing COM1 / SOL fallback')}
                          </NativeSelectOption>
                        )}
                      </NativeSelect>
                    </label>
                    <label>
                      {t('Guacamole connection ID')}
                      <Input
                        type='number'
                        min={node.console_mode === 'remote' ? 1 : 0}
                        max={999999}
                        step={1}
                        value={node.console_id}
                        disabled={node.console_mode !== 'remote'}
                        onChange={(event) =>
                          updateNode(
                            node.id,
                            'console_id',
                            Number(event.target.value)
                          )
                        }
                      />
                    </label>
                  </div>
                </section>
              ))}
            </TabsContent>
            <TabsContent value='links'>
              {draft.links.map((link) => (
                <section className='lab-settings-block' key={link.id}>
                  <h3>
                    {t(
                      LAB_LINKS.find((item) => item.id === link.id)?.title ??
                        link.id
                    )}
                  </h3>
                  <div className='lab-settings-grid'>
                    <label>
                      {t('Source port')}
                      <Input
                        value={link.source_port}
                        maxLength={160}
                        onChange={(event) =>
                          updateLink(link.id, 'source_port', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      {t('Target port')}
                      <Input
                        value={link.target_port}
                        maxLength={160}
                        onChange={(event) =>
                          updateLink(link.id, 'target_port', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      {t('Source address / network')}
                      <Input
                        value={link.source_address}
                        maxLength={160}
                        onChange={(event) =>
                          updateLink(
                            link.id,
                            'source_address',
                            event.target.value
                          )
                        }
                      />
                    </label>
                    <label>
                      {t('Target address / network')}
                      <Input
                        value={link.target_address}
                        maxLength={160}
                        onChange={(event) =>
                          updateLink(
                            link.id,
                            'target_address',
                            event.target.value
                          )
                        }
                      />
                    </label>
                    <label>
                      VLAN
                      <Input
                        value={link.vlan}
                        maxLength={160}
                        onChange={(event) =>
                          updateLink(link.id, 'vlan', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      {t('Planning state')}
                      <NativeSelect
                        value={link.phase}
                        onChange={(event) =>
                          updateLink(link.id, 'phase', event.target.value)
                        }
                      >
                        <NativeSelectOption value='planned'>
                          {t('Planned')}
                        </NativeSelectOption>
                        <NativeSelectOption value='configured'>
                          {t('Configured')}
                        </NativeSelectOption>
                      </NativeSelect>
                    </label>
                  </div>
                </section>
              ))}
            </TabsContent>
          </Tabs>
          {mutation.isError && (
            <p role='alert' className='text-destructive text-sm'>
              {t(
                'Unable to save lab topology. Check console IDs and try again.'
              )}
            </p>
          )}
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={props.onClose}
              disabled={mutation.isPending}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={mutation.isPending}>
              {mutation.isPending ? t('Saving...') : t('Save changes')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
