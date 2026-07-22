import { NextResponse } from 'next/server'
import {
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { validateFlowForActivation } from '@/lib/flows/validate'

/**
 * POST /api/flows/[id]/activate
 *
 * Body: { status: 'draft' | 'active' | 'archived' }
 */

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const ctx = await requireRole('agent')
    const { supabase } = ctx

    const body = (await request.json().catch(() => null)) as
      | { status?: 'draft' | 'active' | 'archived' }
      | null
    const status = body?.status
    if (!status || !['draft', 'active', 'archived'].includes(status)) {
      return NextResponse.json(
        { error: "status must be one of 'draft' | 'active' | 'archived'" },
        { status: 400 },
      )
    }

    const { data: existing } = await supabase
      .from('flows')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (status === 'active') {
      const [{ data: flow }, { data: nodes }] = await Promise.all([
        supabase
          .from('flows')
          .select('name, trigger_type, trigger_config, entry_node_id')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('flow_nodes')
          .select('node_key, node_type, config')
          .eq('flow_id', id),
      ])
      if (!flow) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      const issues = validateFlowForActivation(
        flow as {
          name: string
          trigger_type: 'keyword' | 'first_inbound_message' | 'manual'
          trigger_config: Record<string, unknown>
          entry_node_id: string | null
        },
        (nodes ?? []) as Array<{
          node_key: string
          node_type: string
          config: Record<string, unknown>
        }>,
      )
      const blockers = issues.filter((i) => i.severity === 'error')
      if (blockers.length > 0) {
        return NextResponse.json(
          {
            error: 'Cannot activate flow — fix the issues below first.',
            issues,
          },
          { status: 422 },
        )
      }
    }

    const { data: updated, error } = await supabase
      .from('flows')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ flow: updated })
  } catch (err) {
    return toErrorResponse(err)
  }
}
