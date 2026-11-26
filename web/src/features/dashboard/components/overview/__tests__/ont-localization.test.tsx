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
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { expect, test } from 'vitest'

import { ontFieldLabel } from '@/features/dashboard/ont-presentation'
import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

import { ONTFieldGrid } from '../ont-field-grid'
import parameterNames from './ont-parameter-names.json'

test('ONT parameter labels and statuses switch languages while raw identifiers remain in hover text', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'zh', fallbackLng: 'en', resources: { en, zh } })
  render(
    <I18nextProvider i18n={i18n}>
      <ONTFieldGrid
        pages={[
          {
            path: '/html/bbsp/waninfo/waninfo.asp',
            records: [
              {
                name: 'WANConnection',
                fields: {
                  domain:
                    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1',
                  ServiceList: 'TR069',
                  ConnectionStatus: 'Connected',
                  X_HW_AirtimeFairness: '1',
                  MTU: '1492',
                },
              },
            ],
          },
        ]}
      />
    </I18nextProvider>
  )
  expect(screen.getByRole('table', { name: '关键读数' })).toHaveTextContent(
    '已连接'
  )
  expect(screen.getAllByText(/远程管理/)[0]).toBeVisible()
  await userEvent.click(screen.getByText(/高级参数/))
  const label = await screen.findByText('空口公平性')
  expect(label.closest('td')).toHaveAttribute('title', 'X_HW_AirtimeFairness')
  expect(screen.getByText('最大传输单元').closest('td')).toHaveAttribute(
    'title',
    'MTU'
  )
  await act(() => i18n.changeLanguage('en'))
  expect(screen.getByText('Airtime fairness')).toBeVisible()
  expect(screen.getByRole('table', { name: 'Key readings' })).toHaveTextContent(
    'Connected'
  )
  expect(
    screen.getByText('Maximum transmission unit').closest('td')
  ).toHaveAttribute('title', 'MTU')
})

test('every parameter name observed in the HG8145 snapshot has a localized label', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'zh', resources: { zh } })
  for (const name of parameterNames) {
    expect(ontFieldLabel(name, i18n.t)).not.toBe('未识别参数')
  }
})
