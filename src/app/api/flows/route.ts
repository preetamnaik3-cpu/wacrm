import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { getFlowTemplate } from '@/lib/flows/templates'

/**
 * GET /api/flows — list the caller's flows.
 * POST /api/flows — create a new (draft) flow.
 */

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('flows')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ flows: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')
    const { supabase, userId, accountId } = ctx

    const body = (await request.json().catch(() => null)) as
      | {
          name?: string
          description?: string | null
          trigger_type?: 'keyword' | 'first_inbound_message' | 'manual'
          trigger_config?: Record<string, unknown>
          template_slug?: string
        }
      | null
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (body.template_slug) {
      const template = getFlowTemplate(body.template_slug)
      if (!template) {
        return NextResponse.json(
          { error: `Unknown template_slug "${body.template_slug}"` },
          { status: 400 },
        )
      }
      const { data: flow, error: flowErr } = await supabase
        .from('flows')
        .insert({
          user_id: userId,
          account_id: accountId,
          name: body.name?.trim() || template.name,
          description: template.description,
          status: 'draft',
          trigger_type: template.trigger_type,
          trigger_config: template.trigger_config,
          entry_node_id: template.entry_node_id,
        })
        .select()
        .single()
      if (flowErr || !flow) {
        return NextResponse.json(
          { error: flowErr?.message ?? 'flow insert failed' },
          { status: 500 },
        )
      }
      if (template.nodes.length > 0) {
        const { error: nodesErr } = await supabase.from('flow_nodes').insert(
          template.nodes.map((n) => ({
            flow_id: flow.id,
            node_key: n.node_key,
            node_type: n.node_type,
            config: n.config,
          })),
        )
        if (nodesErr) {
          await supabase.from('flows').delete().eq('id', flow.id)
          return NextResponse.json({ error: nodesErr.message }, { status: 500 })
        }
      }
      return NextResponse.json({ flow }, { status: 201 })
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const trigger_type = body.trigger_type ?? 'keyword'

    const { data, error } = await supabase
      .from('flows')
      .insert({
        user_id: userId,
        account_id: accountId,
        name: body.name.trim(),
        description: body.description ?? null,
        status: 'draft',
        trigger_type,
        trigger_config: body.trigger_config ?? {},
      })
      .select()
      .single()
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'insert failed' },
        { status: 500 },
      )
    }
    return NextResponse.json({ flow: data }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
