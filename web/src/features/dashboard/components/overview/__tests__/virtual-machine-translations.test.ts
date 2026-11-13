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
import { createInstance } from 'i18next'
import { expect, test } from 'vitest'
import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'
import zhTW from '@/i18n/locales/zh-TW.json'

test('switching to Chinese translates virtual machine timeout settings and feedback', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'en', fallbackLng: 'en', resources: { en, zh, 'zh-TW': zhTW } })
  const key = 'Inactivity timeout (minutes)'
  expect(i18n.t(key)).toBe(key)
  for (const [language, resource] of [['zh', zh], ['zh-TW', zhTW]] as const) {
    await i18n.changeLanguage(language)
    for (const message of [
      key,
      'Use 0 to disable. Running Windows machines are saved after this many minutes without an RDP or basic-console connection.',
      'Save timeout',
      'Automatic save timeout updated',
      'Enter a whole number from 0 to 1440.',
    ]) {
      expect(i18n.exists(message)).toBe(true)
      expect(i18n.t(message)).not.toBe(message)
      expect(i18n.t(message)).toBe(resource.translation[message as keyof typeof resource.translation])
    }
  }
})
