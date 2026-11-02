import type { MessageRow } from './db'
import type { OrchestrationDb } from './db/orchestration-db'

// A dispatched worker heartbeats every ~30min; twice that without one reads as hung.
export const HEARTBEAT_STALE_AFTER_MS = 2 * 30 * 60 * 1000

export type StaleHeartbeatDeps = {
  db: OrchestrationDb
  coordinatorHandle: string
  onLog: (msg: string) => void
  /** Dispatches already alerted in this coordinator's lifetime; the caller owns dedup state. */
  alerted: Set<string>
}

/** Returns escalation rows for dispatched workers past the heartbeat deadline, one per Dispatch. */
export function collectStaleHeartbeatEscalations({
  db,
  coordinatorHandle,
  onLog,
  alerted
}: StaleHeartbeatDeps): MessageRow[] {
  const staleCutoff = new Date(Date.now() - HEARTBEAT_STALE_AFTER_MS).toISOString()
  const escalations: MessageRow[] = []
  const dispatched = db.listTasks({ status: 'dispatched' })
  for (const task of dispatched) {
    const dispatch = db.getDispatchContext(task.id)
    if (!dispatch || dispatch.status !== 'dispatched') {
      continue
    }
    const last = dispatch.last_heartbeat_at
    if (last && last > staleCutoff) {
      continue
    }
    // One alert per Dispatch per coordinator lifetime; a heartbeat restarts the clock anyway.
    if (alerted.has(dispatch.id)) {
      continue
    }
    alerted.add(dispatch.id)
    onLog(`Stale heartbeat: ${dispatch.id} on task ${task.id} last heartbeated ${last ?? 'never'}`)
    escalations.push({
      id: `msg_watchdog_${dispatch.id}`,
      run_id: dispatch.run_id,
      from_handle: 'orchestration-watchdog',
      to_handle: coordinatorHandle,
      subject: `stale_heartbeat: Dispatch ${dispatch.id}`,
      body: '',
      type: 'escalation',
      priority: 'high',
      thread_id: null,
      payload: JSON.stringify({
        taskId: task.id,
        dispatchId: dispatch.id,
        lastHeartbeatAt: last,
        staleAfterMs: HEARTBEAT_STALE_AFTER_MS,
        watchdogOnly: true
      }),
      read: 0,
      sequence: 0,
      created_at: new Date().toISOString(),
      delivered_at: null,
      sender_pane_key: null
    })
  }
  return escalations
}
