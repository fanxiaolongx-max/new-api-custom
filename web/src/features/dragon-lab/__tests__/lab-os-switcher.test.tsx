import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { LabOSSwitcher } from '../components/lab-os-switcher'

test('the OS switcher wraps around and reports the slide direction', async () => {
  const onChange = vi.fn()
  render(
    <LabOSSwitcher
      names={['Node-01', 'Node-02']}
      current='Node-02'
      onChange={onChange}
    />
  )
  expect(screen.getByText('Node-02')).toBeInTheDocument()
  expect(screen.getByText('2/2')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Next node' }))
  expect(onChange).toHaveBeenLastCalledWith('Node-01', 'next')
  await userEvent.click(screen.getByRole('button', { name: 'Previous node' }))
  expect(onChange).toHaveBeenLastCalledWith('Node-01', 'prev')
})
