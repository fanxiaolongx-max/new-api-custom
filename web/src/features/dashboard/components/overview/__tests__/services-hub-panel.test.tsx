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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { ServicesHubPanel } from '../services-hub-panel'

describe('Services Hub Grok2API management link', () => {
  test('opens the tunneled creative console', async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    render(<ServicesHubPanel />)

    const card = screen
      .getByText('Grok2API native management')
      .closest('div.rounded-xl')
    expect(card).not.toBeNull()

    await user.click(within(card as HTMLElement).getByRole('button'))

    expect(open).toHaveBeenCalledWith(
      'https://grok-api2.fanxiaolong.uk/creative-console',
      '_blank',
      'noopener,noreferrer'
    )
  })
})
