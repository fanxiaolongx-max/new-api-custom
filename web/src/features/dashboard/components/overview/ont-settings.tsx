/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { saveONTConfig, type ONTConfig } from '@/features/dashboard/ont-api'

export function ONTSettings(props: { config: ONTConfig; onSaved: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const schema = z
    .object({
      enabled: z.boolean(),
      address: z.url({ error: t('Enter a valid router URL') }),
      username: z
        .string()
        .max(128, t('Username must be at most 128 characters')),
      password: z
        .string()
        .max(256, t('Password must be at most 256 characters')),
      interval_seconds: z
        .number()
        .int()
        .min(60, t('Polling interval must be 60–86400 seconds'))
        .max(86400, t('Polling interval must be 60–86400 seconds')),
      insecure_tls: z.boolean(),
    })
    .superRefine((values, ctx) => {
      if (values.enabled && !values.username.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['username'],
          message: t('Enter a username'),
        })
      }
      if (values.enabled && !props.config.password_set && !values.password) {
        ctx.addIssue({
          code: 'custom',
          path: ['password'],
          message: t('Enter a password'),
        })
      }
    })
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      enabled: props.config.enabled,
      address: props.config.address,
      username: props.config.username,
      password: '',
      interval_seconds: props.config.interval_seconds,
      insecure_tls: props.config.insecure_tls,
    },
  })
  const save = useMutation({
    gcTime: 0,
    mutationFn: async () => {
      const values = form.getValues()
      await saveONTConfig({ ...values, password: values.password || undefined })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['system', 'ont'] })
      props.onSaved()
    },
    onSettled: () => form.resetField('password'),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('ONT monitor settings')}</DialogTitle>
        <DialogDescription>
          {t(
            'Read-only monitoring of HG8145V5 pages accessible to this account. Credentials are encrypted on the server.'
          )}
        </DialogDescription>
      </DialogHeader>
      <form
        noValidate
        onSubmit={form.handleSubmit(() => save.mutate())}
        className='mt-4'
      >
        <FieldGroup>
          <Field orientation='horizontal'>
            <FieldLabel htmlFor='ont-enabled'>
              {t('Enable ONT monitoring')}
            </FieldLabel>
            <Switch
              id='ont-enabled'
              checked={form.watch('enabled')}
              onCheckedChange={(value) => form.setValue('enabled', value)}
            />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.address)}>
            <FieldLabel htmlFor='ont-address'>{t('Router address')}</FieldLabel>
            <Input
              id='ont-address'
              {...form.register('address')}
              aria-invalid={Boolean(form.formState.errors.address)}
            />
            <FieldDescription>
              {t(
                'Use a private IPv4 address with HTTP or HTTPS on port 80 or 443. The server must be able to reach it.'
              )}
            </FieldDescription>
            <FieldError errors={[form.formState.errors.address]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.username)}>
            <FieldLabel htmlFor='ont-username'>{t('Username')}</FieldLabel>
            <Input
              id='ont-username'
              autoComplete='off'
              maxLength={128}
              {...form.register('username')}
              aria-invalid={Boolean(form.formState.errors.username)}
            />
            <FieldError errors={[form.formState.errors.username]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.password)}>
            <FieldLabel htmlFor='ont-password'>{t('Password')}</FieldLabel>
            <Input
              id='ont-password'
              type='password'
              autoComplete='new-password'
              maxLength={256}
              {...form.register('password')}
              aria-invalid={Boolean(form.formState.errors.password)}
            />
            <FieldDescription>
              {props.config.password_set
                ? t('Password saved. Leave blank to keep it.')
                : t('Enter the ONT login password.')}
            </FieldDescription>
            <FieldError errors={[form.formState.errors.password]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.interval_seconds)}>
            <FieldLabel htmlFor='ont-interval'>
              {t('Polling interval (seconds)')}
            </FieldLabel>
            <Input
              id='ont-interval'
              type='number'
              min={60}
              max={86400}
              {...form.register('interval_seconds', { valueAsNumber: true })}
              aria-invalid={Boolean(form.formState.errors.interval_seconds)}
            />
            <FieldError errors={[form.formState.errors.interval_seconds]} />
          </Field>
          <Field orientation='horizontal'>
            <FieldLabel htmlFor='ont-tls'>
              {t('Allow the ONT self-signed certificate')}
            </FieldLabel>
            <Switch
              id='ont-tls'
              checked={form.watch('insecure_tls')}
              onCheckedChange={(value) => form.setValue('insecure_tls', value)}
            />
          </Field>
          <FieldDescription>
            {t(
              'This skips certificate verification only for this router. Login failures wait 15 minutes before retrying. Sign out of the router web page if its session limit is reached.'
            )}
          </FieldDescription>
          {save.isError && (
            <p role='alert' className='text-destructive text-sm'>
              {t(
                'ONT settings could not be saved. Check the settings and server configuration.'
              )}
            </p>
          )}
          <Button type='submit' disabled={save.isPending}>
            {save.isPending ? t('Saving...') : t('Save')}
          </Button>
        </FieldGroup>
      </form>
    </>
  )
}
