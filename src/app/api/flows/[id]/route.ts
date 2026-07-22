import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'

/**
 * GET   /api/flows/[id]  — fetch one flow with its nodes.
 * PUT   /api/flows/[id]  — replace name/trigger/entry/fallback + node graph.
 * DELETE /api/flows/[id] — hard delete.
 */

async function requireFlowAccess(flowId: string) {
  const ctx = await getCurrentAccount()
  const { data: flow } = await ctx.supabase
    .from('flows')
    .select('id')
    .eq('id', flowId)
    .maybeSingle()
  if (!flow) {
    return { ok: false as const, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return { ok: true as const, ctx }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const access = await requireFlowAccess(id)
    if (!access.ok) return access.response
    const { supabase } = access.ctx

    const [{ data: flow }, { data: nodes }] = await Promise.all([
      supabase.from('flows').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('flow_nodes')
        .select('*')
        .eq('flow_id', id)
        .order('created_at', { ascending: true }),
    ])
    if (!flow) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ flow, nodes: nodes ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

interface PutBody {
  name?: string
  description?: string | null
  trigger_type?: 'keyword' | 'first_inbound_message' | 'manual'
  trigger_config?: Record<string, unknown>
  entry_node_id?: string | null
  fallback_policy?: Record<string, unknown>
  nodes?: Array<{
    node_key: string
    node_type: string
    config: Record<string, unknown>
    position_x?: number
    position_y?: number
  }>
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    await requireRole('agent')
    const access = await requireFlowAccess(id)
    if (!access.ok) return access.response
    const { supabase } = access.ctx

    const body = (await request.json().catch(() => null)) as PutBody | null
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json(
        { error: 'name cannot be empty' },
        { status: 400 },
      )
    }

    const flowPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (body.name !== undefined) flowPatch.name = body.name.trim()
    if (body.description !== undefined)
      flowPatch.description = body.description
    if (body.trigger_type !== undefined) flowPatch.trigger_type = body.trigger_type
    if (body.trigger_config !== undefined)
      flowPatch.trigger_config = body.trigger_config
    if (body.entry_node_id !== undefined)
      flowPatch.entry_node_id = body.entry_node_id
    if (body.fallback_policy !== undefined)
      flowPatch.fallback_policy = body.fallback_policy

    const { error: updErr } = await supabase
      .from('flows')
      .update(flowPatch)
      .eq('id', id)
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    if (body.nodes !== undefined) {
      const { error: delErr } = await supabase
        .from('flow_nodes')
        .delete()
        .eq('flow_id', id)
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 })
      }
      if (body.nodes.length > 0) {
        const { error: insErr } = await supabase.from('flow_nodes').insert(
          body.nodes.map((n) => ({
            flow_id: id,
            node_key: n.node_key,
            node_type: n.node_type,
            config: n.config,
            position_x: n.position_x ?? 0,
            position_y: n.position_y ?? 0,
          })),
        )
        if (insErr) {
          return NextResponse.json({ error: insErr.message }, { status: 500 })
        }
      }
    }

    const [{ data: flow }, { data: nodes }] = await Promise.all([
      supabase.from('flows').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('flow_nodes')
        .select('*')
        .eq('flow_id', id)
        .order('created_at', { ascending: true }),
    ])
    return NextResponse.json({ flow, nodes: nodes ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    await requireRole('agent')
    const access = await requireFlowAccess(id)
    if (!access.ok) return access.response

    const { error } = await access.ctx.supabase
      .from('flows')
      .delete()
      .eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
