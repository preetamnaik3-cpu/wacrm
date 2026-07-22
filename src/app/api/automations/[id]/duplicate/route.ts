import { NextResponse } from 'next/server'
import {
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await requireRole('agent')
    const { supabase, userId } = ctx

    const { data: original, error: origErr } = await supabase
      .from('automations')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (origErr) return NextResponse.json({ error: origErr.message }, { status: 500 })
    if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: copy, error: copyErr } = await supabase
      .from('automations')
      .insert({
        account_id: original.account_id,
        user_id: userId,
        name: `${original.name} (Copy)`,
        description: original.description,
        trigger_type: original.trigger_type,
        trigger_config: original.trigger_config,
        is_active: false,
      })
      .select()
      .single()
    if (copyErr || !copy) {
      return NextResponse.json({ error: copyErr?.message ?? 'copy failed' }, { status: 500 })
    }

    // Steps are copied via admin — automation_steps RLS joins parent
    // automations; bulk clone is simpler with service role after auth gate.
    const admin = supabaseAdmin()
    const { data: steps } = await admin
      .from('automation_steps')
      .select('id, parent_step_id, branch, step_type, step_config, position')
      .eq('automation_id', id)
      .order('position', { ascending: true })

    if (steps && steps.length > 0) {
      const idMap = new Map<string, string>()
      const uid = () =>
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36)
      for (const row of steps) idMap.set(row.id as string, uid())

      const rows = steps.map((row) => ({
        id: idMap.get(row.id as string)!,
        automation_id: copy.id,
        parent_step_id: row.parent_step_id ? idMap.get(row.parent_step_id as string) : null,
        branch: row.branch,
        step_type: row.step_type,
        step_config: row.step_config,
        position: row.position,
      }))
      const { error: insErr } = await admin.from('automation_steps').insert(rows)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    return NextResponse.json({ automation: copy }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
