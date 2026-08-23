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

export type ChannelTokenExpiryInfo = {
  isJwt: boolean
  expiresAt: Date | null
  issuedAt: Date | null
  email?: string
  isExpired: boolean
  daysRemaining: number
  hoursRemaining: number
  minutesRemaining: number
  status: 'expired' | 'critical' | 'warning' | 'healthy' | 'unknown'
  formattedExpiry: string
  formattedRemaining: string
}

/**
 * Extract clean accessToken from raw text, JSON object, or session dump
 */
export function extractAccessTokenFromInput(input: string): {
  cleanToken: string
  isJsonExtracted: boolean
} {
  if (!input || typeof input !== 'string') {
    return { cleanToken: '', isJsonExtracted: false }
  }
  const text = input.trim()

  // 1. Try parsing full JSON from chatgpt.com/api/auth/session
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed?.accessToken === 'string' && parsed.accessToken.trim()) {
        return {
          cleanToken: parsed.accessToken.trim(),
          isJsonExtracted: true,
        }
      }
    } catch {
      // ignore parse error, continue regex fallback
    }
  }

  // 2. Regex match for "accessToken": "eyJ..."
  const jsonMatch = text.match(/"accessToken"\s*:\s*"([^"]+)"/)
  if (jsonMatch && jsonMatch[1]) {
    return {
      cleanToken: jsonMatch[1].trim(),
      isJsonExtracted: true,
    }
  }

  // 3. Regex match for raw JWT token (eyJ...)
  const jwtMatch = text.match(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/)
  if (jwtMatch && jwtMatch[0]) {
    const isFullText = jwtMatch[0] === text
    return {
      cleanToken: jwtMatch[0],
      isJsonExtracted: !isFullText,
    }
  }

  return {
    cleanToken: text,
    isJsonExtracted: false,
  }
}

/**
 * Safely parse a JWT without full verification to extract expiry and metadata
 */
export function parseJwtPayload(token: string): Record<string, any> | null {
  if (!token || typeof token !== 'string') return null
  const { cleanToken } = extractAccessTokenFromInput(token)

  // Extract first JWT token if multiple are passed or prefixed
  const parts = cleanToken.split('.')
  if (parts.length < 3) {
    return null
  }

  try {
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

/**
 * Analyze a channel's key for JWT token expiry and status
 */
export function analyzeChannelTokenExpiry(key: string): ChannelTokenExpiryInfo {
  const payload = parseJwtPayload(key)

  if (!payload || typeof payload.exp !== 'number') {
    return {
      isJwt: false,
      expiresAt: null,
      issuedAt: null,
      isExpired: false,
      daysRemaining: 0,
      hoursRemaining: 0,
      minutesRemaining: 0,
      status: 'unknown',
      formattedExpiry: '',
      formattedRemaining: '',
    }
  }

  const expMs = payload.exp * 1000
  const iatMs = payload.iat ? payload.iat * 1000 : null
  const expiresAt = new Date(expMs)
  const issuedAt = iatMs ? new Date(iatMs) : null
  const email =
    payload['https://api.openai.com/profile']?.email ||
    payload.email ||
    payload.preferred_username

  const nowMs = Date.now()
  const diffMs = expMs - nowMs
  const isExpired = diffMs <= 0

  const totalMinutes = Math.floor(Math.abs(diffMs) / (60 * 1000))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60

  let status: ChannelTokenExpiryInfo['status'] = 'healthy'
  if (isExpired) {
    status = 'expired'
  } else if (days <= 2) {
    status = 'critical'
  } else if (days <= 7) {
    status = 'warning'
  } else {
    status = 'healthy'
  }

  const year = expiresAt.getFullYear()
  const month = String(expiresAt.getMonth() + 1).padStart(2, '0')
  const date = String(expiresAt.getDate()).padStart(2, '0')
  const hoursStr = String(expiresAt.getHours()).padStart(2, '0')
  const minStr = String(expiresAt.getMinutes()).padStart(2, '0')
  const formattedExpiry = `${year}-${month}-${date} ${hoursStr}:${minStr}`

  let formattedRemaining = ''
  if (isExpired) {
    if (days > 0) {
      formattedRemaining = `已过期 ${days} 天`
    } else if (hours > 0) {
      formattedRemaining = `已过期 ${hours} 小时`
    } else {
      formattedRemaining = `已过期 ${minutes} 分钟`
    }
  } else {
    if (days > 0) {
      formattedRemaining = `剩余 ${days} 天 ${hours} 小时`
    } else if (hours > 0) {
      formattedRemaining = `剩余 ${hours} 小时 ${minutes} 分钟`
    } else {
      formattedRemaining = `剩余 ${minutes} 分钟`
    }
  }

  return {
    isJwt: true,
    expiresAt,
    issuedAt,
    email,
    isExpired,
    daysRemaining: days,
    hoursRemaining: hours,
    minutesRemaining: minutes,
    status,
    formattedExpiry,
    formattedRemaining,
  }
}
