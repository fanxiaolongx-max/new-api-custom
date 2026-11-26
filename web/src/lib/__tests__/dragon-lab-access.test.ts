import { expect, test } from 'vitest'

import {
  canAccessDragonLab,
  dragonLabRedirect,
  isDragonLabOnlyUser,
} from '../dragon-lab-access'

const admin = { id: 5, username: 'liqiyan', role: 10 }
const labUser = {
  ...admin,
  permissions: { admin_permissions: { dragon_lab: { full: true } } },
}
test('only delegated administrators get the lab-only workspace, without changing their role', () => {
  expect(canAccessDragonLab(admin)).toBe(false)
  expect(canAccessDragonLab(labUser)).toBe(true)
  expect(isDragonLabOnlyUser(labUser)).toBe(true)
  expect(labUser.role).toBe(10)
  expect(dragonLabRedirect(labUser, '/users')).toBe('/')
  expect(dragonLabRedirect(labUser, '/dashboard')).toBe('/')
  expect(dragonLabRedirect(labUser, '/')).toBeNull()
  expect(dragonLabRedirect({ ...admin, role: 100 }, '/users')).toBeNull()
  expect(isDragonLabOnlyUser({ ...admin, role: 100 })).toBe(false)
  expect(canAccessDragonLab({ ...admin, role: 100 })).toBe(true)
  expect(dragonLabRedirect(null, '/sign-in')).toBeNull()
  expect(dragonLabRedirect(admin, '/users')).toBeNull()
})
