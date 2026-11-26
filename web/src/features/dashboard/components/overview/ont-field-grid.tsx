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
import {
  Cable,
  Cpu,
  Globe,
  Layers,
  Radio,
  Search,
  Users,
  Wifi,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { ONTOverview } from '@/features/dashboard/ont-api'
import {
  buildONTEntities,
  isONTKeyField,
  ontCategoryLabel,
  ontFieldLabel,
  ontEntityLabel,
  ontFieldValue,
  type ONTCategory,
  type ONTEntity,
} from '@/features/dashboard/ont-presentation'

import { ONTEquipmentSummary } from './ont-equipment-summary'

const categories: ONTCategory[] = [
  'wan',
  'ethernet',
  'wlan',
  'clients',
  'optics',
  'device',
  'other',
]
const icons = {
  wan: Globe,
  ethernet: Cable,
  wlan: Wifi,
  clients: Users,
  optics: Radio,
  device: Cpu,
  other: Layers,
}

function ONTDetailsPage(props: {
  entities: ONTEntity[]
  category: ONTCategory
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [advancedPage, setAdvancedPage] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const needle = search.toLowerCase().trim()
  const filtered = props.entities.filter(
    (entity) =>
      !needle ||
      [
        entity.identity,
        ontEntityLabel(entity, t),
        ...entity.fields.flatMap((field) => [
          field.name,
          field.value,
          ontFieldLabel(field.name, t),
          ontFieldValue(field.name, field.value, t),
        ]),
      ].some((value) => value.toLowerCase().includes(needle))
  )
  const visible = filtered.filter((entity) =>
    entity.fields.some(
      (field) =>
        isONTKeyField(field.name) &&
        (props.category !== 'clients' || !['', '0', '--'].includes(field.value))
    )
  )
  const primaryPage = Math.min(
    page,
    Math.max(0, Math.ceil(visible.length / 8) - 1)
  )
  const rows = visible.slice(primaryPage * 8, (primaryPage + 1) * 8)
  const fields = filtered.flatMap((entity) =>
    entity.fields
      .filter(
        (field) =>
          !needle ||
          entity.identity.toLowerCase().includes(needle) ||
          ontEntityLabel(entity, t).toLowerCase().includes(needle) ||
          `${field.name} ${ontFieldLabel(field.name, t)} ${field.value} ${ontFieldValue(field.name, field.value, t)}`
            .toLowerCase()
            .includes(needle)
      )
      .map((field) => ({
        ...field,
        entity: ontEntityLabel(entity, t),
        rawEntity: entity.identity,
        entityId: entity.id,
        source: entity.sources.join(' · '),
      }))
  )
  const detailPage = Math.min(
    advancedPage,
    Math.max(0, Math.ceil(fields.length / 16) - 1)
  )
  return (
    <div className='space-y-3'>
      <ONTEquipmentSummary
        entities={props.entities}
        category={props.category}
      />
      <div className='relative max-w-sm'>
        <Search
          className='text-muted-foreground absolute top-2 left-2.5 size-3.5'
          aria-hidden='true'
        />
        <Input
          value={search}
          aria-label={t('Search collected fields')}
          placeholder={t('Search collected fields')}
          className='h-8 pl-8 text-xs'
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(0)
            setAdvancedPage(0)
          }}
        />
      </div>
      {visible.length > 0 && (
        <div className='overflow-x-auto rounded-xl border'>
          <table
            aria-label={t('Key readings')}
            className='w-full min-w-[540px] table-fixed text-left text-[11px]'
          >
            <thead className='bg-muted/50 text-muted-foreground'>
              <tr>
                <th className='w-[22%] px-3 py-2 font-medium'>{t('Name')}</th>
                <th className='w-[43%] px-3 py-2 font-medium'>
                  {t('Live monitoring')}
                </th>
                <th className='px-3 py-2 font-medium'>
                  {t('Device configuration')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entity) => (
                <tr
                  key={entity.id}
                  className='even:bg-muted/15 border-t align-top'
                >
                  <th
                    scope='row'
                    className='px-3 py-3 font-medium break-all'
                    title={`${entity.identity} · ${entity.domain || ''}`}
                  >
                    {ontEntityLabel(entity, t)}
                  </th>
                  {[true, false].map((dynamic) => (
                    <td key={String(dynamic)} className='px-3 py-2'>
                      <dl className='flex flex-wrap gap-x-4 gap-y-2'>
                        {entity.fields
                          .filter(
                            (field) =>
                              field.dynamic === dynamic &&
                              !(
                                /^(name|ssid|realname)$/i.test(field.name) &&
                                field.value === entity.identity
                              ) &&
                              isONTKeyField(field.name) &&
                              (!needle ||
                                entity.identity
                                  .toLowerCase()
                                  .includes(needle) ||
                                `${field.name} ${ontFieldLabel(field.name, t)} ${field.value} ${ontFieldValue(field.name, field.value, t)}`
                                  .toLowerCase()
                                  .includes(needle))
                          )
                          .slice(0, 6)
                          .map((field) => (
                            <div
                              key={`${field.name}:${field.value}`}
                              className='max-w-full min-w-20'
                            >
                              <dt
                                className='text-muted-foreground text-[9px]'
                                title={field.name}
                              >
                                {ontFieldLabel(field.name, t)}
                              </dt>
                              <dd
                                title={field.value}
                                className='mt-0.5 font-mono font-medium break-all'
                              >
                                {ontFieldValue(field.name, field.value, t)}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visible.length > 8 && (
        <div className='flex items-center justify-end gap-2 text-[10px]'>
          <span className='text-muted-foreground'>
            {t('Showing {{from}}–{{to}} of {{total}}', {
              from: primaryPage * 8 + 1,
              to: Math.min((primaryPage + 1) * 8, visible.length),
              total: visible.length,
            })}
          </span>
          <Button
            size='sm'
            variant='ghost'
            className='h-6 text-[10px]'
            disabled={primaryPage === 0}
            onClick={() => setPage(primaryPage - 1)}
          >
            {t('Previous')}
          </Button>
          <Button
            size='sm'
            variant='ghost'
            className='h-6 text-[10px]'
            disabled={(primaryPage + 1) * 8 >= visible.length}
            onClick={() => setPage(primaryPage + 1)}
          >
            {t('Next')}
          </Button>
        </div>
      )}
      {filtered.length === 0 && (
        <p className='text-muted-foreground rounded-lg border border-dashed p-5 text-xs'>
          {t('No matching fields')}
        </p>
      )}
      <details
        open={expanded || Boolean(needle)}
        onToggle={(event) => {
          if (!needle) setExpanded(event.currentTarget.open)
        }}
        className='bg-muted/15 rounded-xl border'
      >
        <summary className='text-muted-foreground cursor-pointer px-3 py-2.5 text-[11px] font-medium'>
          {t('Advanced parameters')}{' '}
          <span className='ml-1 font-mono'>({fields.length})</span>
        </summary>
        {(expanded || Boolean(needle)) && (
          <>
            <div className='overflow-x-auto border-t'>
              <table
                aria-label={t('Advanced parameters')}
                className='w-full min-w-[500px] table-fixed text-left text-[10px]'
              >
                <thead className='bg-muted/30 text-muted-foreground'>
                  <tr>
                    <th className='w-[22%] px-3 py-2'>{t('Name')}</th>
                    <th className='w-[30%] px-3 py-2'>{t('Parameter')}</th>
                    <th className='px-3 py-2'>{t('Value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {fields
                    .slice(detailPage * 16, (detailPage + 1) * 16)
                    .map((field) => (
                      <tr
                        key={`${field.entityId}:${field.name}:${field.value}`}
                        className='even:bg-muted/15 border-t'
                      >
                        <td
                          className='px-3 py-2 font-mono break-all'
                          title={`${field.rawEntity} · ${field.source}`}
                        >
                          {field.entity}
                        </td>
                        <td title={field.name} className='px-3 py-2 break-all'>
                          <span className='text-muted-foreground mr-1'>
                            {field.dynamic ? '●' : '○'}
                          </span>
                          {ontFieldLabel(field.name, t)}
                        </td>
                        <td
                          title={field.value}
                          className='px-3 py-2 font-mono break-all'
                        >
                          {ontFieldValue(field.name, field.value, t)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {fields.length > 16 && (
              <div className='flex items-center justify-end gap-2 border-t px-3 py-2 text-[10px]'>
                <span>
                  {t('Showing {{from}}–{{to}} of {{total}}', {
                    from: detailPage * 16 + 1,
                    to: Math.min((detailPage + 1) * 16, fields.length),
                    total: fields.length,
                  })}
                </span>
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={detailPage === 0}
                  onClick={() => setAdvancedPage(detailPage - 1)}
                >
                  {t('Previous')}
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={(detailPage + 1) * 16 >= fields.length}
                  onClick={() => setAdvancedPage(detailPage + 1)}
                >
                  {t('Next')}
                </Button>
              </div>
            )}
          </>
        )}
      </details>
    </div>
  )
}

export function ONTFieldGrid(props: { pages: ONTOverview['pages'] }) {
  const { t } = useTranslation()
  const entities = useMemo(() => buildONTEntities(props.pages), [props.pages])
  const available = categories.filter((category) =>
    entities.some((entity) => entity.category === category)
  )
  const [selected, setSelected] = useState<ONTCategory>('wan')
  const active = available.includes(selected) ? selected : available[0]
  if (!active) {
    return (
      <p className='text-muted-foreground rounded-xl border border-dashed p-5 text-xs'>
        {t('No fields have been collected for this module yet.')}
      </p>
    )
  }
  return (
    <Tabs
      value={active}
      onValueChange={(value) => setSelected(value as ONTCategory)}
      className='min-w-0 gap-4'
    >
      <TabsList
        aria-label={t('Equipment details')}
        className='h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 group-data-horizontal/tabs:h-auto'
      >
        {available.map((category) => {
          const Icon = icons[category]
          return (
            <TabsTrigger
              key={category}
              value={category}
              className='data-active:border-primary/30 data-active:bg-primary/10 data-active:text-primary h-9 flex-none gap-2 rounded-lg border px-3 text-[11px]'
            >
              <Icon className='size-3.5' aria-hidden='true' />
              {ontCategoryLabel(category, t)}
              <span className='bg-muted/80 text-muted-foreground rounded px-1 font-mono text-[9px]'>
                {
                  entities.filter((entity) => entity.category === category)
                    .length
                }
              </span>
            </TabsTrigger>
          )
        })}
      </TabsList>
      <TabsContent value={active} key={active} className='min-w-0'>
        <ONTDetailsPage
          entities={entities.filter((entity) => entity.category === active)}
          category={active}
        />
      </TabsContent>
    </Tabs>
  )
}
