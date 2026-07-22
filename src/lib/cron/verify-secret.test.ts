import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { verifyCronSecret } from './verify-secret'

describe('verifyCronSecret', () => {
  beforeEach(() => {
    process.env.AUTOMATION_CRON_SECRET = 'test-cron-secret-value'
    delete process.env.CRON_SECRET
  })

  afterEach(() => {
    delete process.env.AUTOMATION_CRON_SECRET
    delete process.env.CRON_SECRET
  })

  it('accepts x-cron-secret header', () => {
    const req = new NextRequest('https://app.test/api/automations/cron', {
      headers: { 'x-cron-secret': 'test-cron-secret-value' },
    })
    expect(verifyCronSecret(req)).toBeNull()
  })

  it('accepts Authorization Bearer token (Vercel Cron)', () => {
    const req = new NextRequest('https://app.test/api/automations/cron', {
      headers: { authorization: 'Bearer test-cron-secret-value' },
    })
    expect(verifyCronSecret(req)).toBeNull()
  })

  it('rejects wrong secret', () => {
    const req = new NextRequest('https://app.test/api/automations/cron', {
      headers: { 'x-cron-secret': 'wrong' },
    })
    const res = verifyCronSecret(req)
    expect(res?.status).toBe(401)
  })

  it('returns 503 when cron secret env is missing', () => {
    delete process.env.AUTOMATION_CRON_SECRET
    const req = new NextRequest('https://app.test/api/automations/cron', {
      headers: { 'x-cron-secret': 'anything' },
    })
    const res = verifyCronSecret(req)
    expect(res?.status).toBe(503)
  })
})
