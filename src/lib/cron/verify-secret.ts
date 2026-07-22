import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

/**
 * Verify cron invocations. Accepts the shared secret via:
 * - `x-cron-secret` header (manual pingers / GitHub Actions)
 * - `Authorization: Bearer <secret>` (Vercel Cron)
 *
 * Reads `AUTOMATION_CRON_SECRET` first, then `CRON_SECRET`.
 */
export function verifyCronSecret(request: Request): NextResponse | null {
  const expected =
    process.env.AUTOMATION_CRON_SECRET ?? process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }

  const authHeader = request.headers.get('authorization') ?? ''
  const bearer = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : ''
  const supplied = request.headers.get('x-cron-secret') ?? bearer

  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
