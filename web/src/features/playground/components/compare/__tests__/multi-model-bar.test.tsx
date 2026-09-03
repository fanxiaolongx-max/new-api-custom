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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { MultiModelBar } from '../multi-model-bar'

const MODELS = [
  { label: 'gpt-5.6-sol', value: 'gpt-5.6-sol' },
  { label: 'gemini-3.1-pro', value: 'gemini-3.1-pro' },
  { label: 'grok-4.6', value: 'grok-4.6' },
  { label: 'qwen/qwen3.6-27b', value: 'qwen/qwen3.6-27b' },
]

describe('multi-model comparison controls', () => {
  test('opens the add-model menu and adds an available model', async () => {
    const user = userEvent.setup()
    const onConfigChange = vi.fn()

    render(
      <MultiModelBar
        config={{
          model: 'gpt-5.6-sol',
          group: 'default',
          temperature: 1,
          top_p: 1,
          max_tokens: 1024,
          frequency_penalty: 0,
          presence_penalty: 0,
          seed: null,
          stream: true,
          mode: 'compare',
          compareModels: ['gpt-5.6-sol', 'gemini-3.1-pro'],
        }}
        models={MODELS}
        onConfigChange={onConfigChange}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Add model' }))
    await user.click(screen.getByRole('menuitem', { name: 'grok-4.6' }))

    expect(onConfigChange).toHaveBeenCalledWith('compareModels', [
      'gpt-5.6-sol',
      'gemini-3.1-pro',
      'grok-4.6',
    ])
  })

  test('builds comparison presets only from currently available models', async () => {
    const user = userEvent.setup()
    const onConfigChange = vi.fn()

    render(
      <MultiModelBar
        config={{
          model: 'gpt-5.6-sol',
          group: 'default',
          temperature: 1,
          top_p: 1,
          max_tokens: 1024,
          frequency_penalty: 0,
          presence_penalty: 0,
          seed: null,
          stream: true,
          mode: 'compare',
          compareModels: ['gpt-5.6-sol', 'gemini-3.1-pro'],
        }}
        models={MODELS.slice(0, 3)}
        onConfigChange={onConfigChange}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Presets' }))
    await user.click(
      screen.getByRole('menuitem', {
        name: 'gpt-5.6-sol + gemini-3.1-pro + grok-4.6',
      })
    )

    expect(onConfigChange).toHaveBeenCalledWith('compareModels', [
      'gpt-5.6-sol',
      'gemini-3.1-pro',
      'grok-4.6',
    ])
    expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument()
  })
})
