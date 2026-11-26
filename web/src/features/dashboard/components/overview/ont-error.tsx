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
import { useTranslation } from 'react-i18next'

export function ONTError(props: { code?: string }) {
  const { t } = useTranslation()
  let message = t('Some ONT pages could not be collected. See page details.')
  if (props.code === 'connection') {
    message = t(
      'Cannot reach the ONT. Check the address, network and TLS certificate.'
    )
  }
  if (props.code === 'authentication') {
    message = t('ONT login failed. Check the username and password.')
  }
  if (props.code === 'login_busy') {
    message = t(
      'ONT session limit reached. Sign out of the router web page and wait for the next poll.'
    )
  }
  if (props.code === 'locked') {
    message = t(
      'The ONT reports recent failed logins or a login lock. Monitoring will retry after 15 minutes.'
    )
  }
  if (props.code === 'unsupported') {
    message = t('The ONT login protocol is not supported by this collector.')
  }
  if (props.code === 'permission') {
    message = t('This page is unavailable to the current session or account.')
  }
  if (props.code === 'unavailable') {
    message = t('This page is not available on this firmware.')
  }
  if (props.code === 'no_data') {
    message = t(
      'No readable data was found. This page may require browser rendering.'
    )
  }
  return <p className='text-muted-foreground text-xs'>{message}</p>
}
