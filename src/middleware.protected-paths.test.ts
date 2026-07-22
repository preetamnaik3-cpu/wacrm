import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = null
let refreshedCookies: Array<{
  name: string
  value: string
  options: Record<string, unknown>
}> = []

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: {
      cookies: { setAll: (c: typeof refreshedCookies) => void }
    },
  ) => ({
    auth: {
      getUser: async () => {
        if (refreshedCookies.length) opts.cookies.setAll(refreshedCookies)
        return { data: { user: mockUser } }
      },
    },
  }),
}))

const { middleware } = await import('./middleware')

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  mockUser = null
  refreshedCookies = []
})

afterEach(() => vi.clearAllMocks())

describe('middleware — protected routes', () => {
  it('redirects unauthenticated users away from /flows', async () => {
    mockUser = null

    const res = await middleware(new NextRequest('https://app.test/flows'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('allows authenticated users on /flows', async () => {
    mockUser = { id: 'user-1' }

    const res = await middleware(new NextRequest('https://app.test/flows/abc'))

    expect(res.headers.get('location')).toBeNull()
  })
})
