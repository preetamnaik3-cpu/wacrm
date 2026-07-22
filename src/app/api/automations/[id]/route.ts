import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import {
  loadStepsTree,
  replaceSteps,
  type BuilderStepInput,
} from '@/lib/automations/steps-tree'
import {
  validateStepsForActivation,
  validateTriggerForActivation,
} from '@/lib/automations/validate'

async function requireAutomationAccess(automationId: string) {
  const ctx = await getCurrentAccount()
  const { data: automation } = await ctx.supabase
    .from('automations')
    .select('id, is_active, trigger_type, trigger_config')
    .eq('id', automationId)
    .maybeSingle()
  if (!automation) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    }
  }
  return { ok: true as const, ctx, automation }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const access = await requireAutomationAccess(id)
    if (!access.ok) return access.response

    const { data: automation, error } = await access.ctx.supabase
      .from('automations')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!automation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const steps = await loadStepsTree(id)
    return NextResponse.json({ automation, steps })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await requireRole('agent')
    const access = await requireAutomationAccess(id)
    if (!access.ok) return access.response
    const { automation, ctx } = access

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const update: Record<string, unknown> = {}
    for (const k of [
      'name',
      'description',
      'trigger_type',
      'trigger_config',
      'is_active',
    ] as const) {
      if (k in body) update[k] = body[k]
    }

    const willBeActive =
      typeof update.is_active === 'boolean' ? update.is_active : automation.is_active
    if (willBeActive) {
      const mergedTriggerType = (update.trigger_type ?? automation.trigger_type) as string
      const mergedTriggerConfig = update.trigger_config ?? automation.trigger_config
      const mergedSteps = Array.isArray(body.steps)
        ? (body.steps as { step_type: string; step_config: Record<string, unknown> }[])
        : await loadStepsTree(id)
      const issues = [
        ...validateTriggerForActivation(mergedTriggerType, mergedTriggerConfig),
        ...validateStepsForActivation(mergedSteps),
      ]
      if (issues.length > 0) {
        return NextResponse.json(
          {
            error: 'Cannot keep automation active with invalid configuration',
            issues,
          },
          { status: 400 },
        )
      }
    }

    if (Object.keys(update).length > 0) {
      const { error: updErr } = await ctx.supabase
        .from('automations')
        .update(update)
        .eq('id', id)
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    if (Array.isArray(body.steps)) {
      const err = await replaceSteps(id, body.steps as BuilderStepInput[])
      if (err) return NextResponse.json({ error: err }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await requireRole('agent')
    const access = await requireAutomationAccess(id)
    if (!access.ok) return access.response

    const { error } = await access.ctx.supabase
      .from('automations')
      .delete()
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
