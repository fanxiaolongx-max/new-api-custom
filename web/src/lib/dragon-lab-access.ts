import type { AuthUser } from '@/stores/auth-store'

import { hasPermission } from './admin-permissions'
import { ROLE } from './roles'

export function canAccessDragonLab(user: AuthUser | null | undefined): boolean {
  return hasPermission(user, 'dragon_lab', 'full')
}
export function isDragonLabOnlyUser(
  user: AuthUser | null | undefined
): boolean {
  return Boolean(
    user && user.role < ROLE.SUPER_ADMIN && canAccessDragonLab(user)
  )
}
export function dragonLabRedirect(
  user: AuthUser | null | undefined,
  pathname: string
): '/' | null {
  return isDragonLabOnlyUser(user) && pathname !== '/' ? '/' : null
}
