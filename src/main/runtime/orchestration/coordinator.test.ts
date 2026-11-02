import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from './db'
import { reconcileLifecycleMessage } from './lifecycle-reconciliation'
import { Coordinator } from './coordinator'
import { dispatchPreambleSendOptions } from './preamble'
import { createRootDispatch } from './db/root-dispatch-test-fixture'
import {
  runId,
  createMockRuntime,
  insertWorkerDone,
  settleCoordinatorRun
} from './coordinator.test-helpers'

describe('Coordinator', () => {
  let db: OrchestrationDb

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    try {
      db?.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('throws if no tasks exist', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    const coordinator = new Coordinator(db, runtime, {
      spec: 'do stuff',
      coordinatorHandle: 'coord'
    })
    await expect(coordinator.run()).rejects.toThrow('No tasks found')
  })

  it('dispatches a ready task to an available terminal', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.cliCommand = 'orca-ide'
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]

    const task = db.createTask({
      runId,
      spec: 'implement feature'
    })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'build it',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50
    })

    const runPromise = coordinator.run()

    await vi.advanceTimersByTimeAsync(100)

    insertWorkerDone(db, { taskId: task.id, filesModified: ['a.ts'] })

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('completed')
    expect(result.completedTasks).toContain(task.id)
    expect(runtime.sentMessages.length).toBeGreaterThan(0)
    expect(runtime.sentMessages[0].text).toContain('orca-ide orchestration send')
    expect(runtime.sentMessages[0].options).toEqual(dispatchPreambleSendOptions(expect.any(String)))
  })

  it('records the assignee pane key when the runtime can resolve one', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]
    const withPaneLookup = Object.assign(runtime, {
      getTerminalPaneKey: (handle: string) => (handle === 'term_a' ? 'tab_a:leaf_a' : null)
    })

    const task = db.createTask({
      runId,
      spec: 'implement feature'
    })
    const coordinator = new Coordinator(db, withPaneLookup, {
      spec: 'build it',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50
    })
    const runPromise = coordinator.run()
    await vi.advanceTimersByTimeAsync(100)

    expect(db.getDispatchContext(task.id)?.assignee_pane_key).toBe('tab_a:leaf_a')
    expect(db.getDispatchContext(task.id)?.process_incarnation).toBeNull()

    insertWorkerDone(db, { taskId: task.id })
    await settleCoordinatorRun(runPromise)
  })

  it('records authenticated process authority for automatic dispatch', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]
    const withAuthority = Object.assign(runtime, {
      getOrchestrationDispatchAuthority: (handle: string) =>
        handle === 'term_a'
          ? {
              paneKey: 'tab_a:leaf_a',
              processIncarnation: 'pty_a:incarnation-a',
              launchTokenHash: 'launch-token-hash'
            }
          : null
    })
    const task = db.createTask({
      runId,
      spec: 'implement feature'
    })
    const coordinator = new Coordinator(db, withAuthority, {
      spec: 'build it',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50
    })
    const runPromise = coordinator.run()
    await vi.advanceTimersByTimeAsync(100)

    expect(db.getDispatchContext(task.id)).toMatchObject({
      assignee_pane_key: 'tab_a:leaf_a',
      process_incarnation: 'pty_a:incarnation-a',
      launch_token_hash: 'launch-token-hash'
    })

    insertWorkerDone(db, { taskId: task.id })
    await settleCoordinatorRun(runPromise)
  })

  it('records completedTasks when send reconciled worker_done before coordinator read', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()

    const task = db.createTask({
      runId,
      spec: 'send-driven completion'
    })
    const dispatch = createRootDispatch(db, task.id, 'term_a')
    const msg = db.insertMessage({
      runId,
      from: 'term_a',
      to: 'coord',
      subject: 'Done',
      type: 'worker_done',
      payload: JSON.stringify({ taskId: task.id, dispatchId: dispatch.id, outcome: 'succeeded' })
    })

    reconcileLifecycleMessage(db, msg)

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 20
    })
    const result = await settleCoordinatorRun(coordinator.run())

    expect(result.status).toBe('completed')
    expect(result.completedTasks).toContain(task.id)
  })

  it('does not duplicate completedTasks for repeated completed worker_done messages', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()

    const task = db.createTask({
      runId,
      spec: 'duplicate completion'
    })
    const dispatch = createRootDispatch(db, task.id, 'term_a')
    const payload = JSON.stringify({
      taskId: task.id,
      dispatchId: dispatch.id,
      outcome: 'succeeded'
    })
    const first = db.insertMessage({
      runId,
      from: 'term_a',
      to: 'coord',
      subject: 'Done',
      type: 'worker_done',
      payload
    })
    db.insertMessage({
      runId,
      from: 'term_a',
      to: 'coord',
      subject: 'Done again',
      type: 'worker_done',
      payload
    })

    reconcileLifecycleMessage(db, first)

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 20
    })
    const result = await settleCoordinatorRun(coordinator.run())

    expect(result.status).toBe('completed')
    expect(result.completedTasks.filter((id) => id === task.id)).toHaveLength(1)
  })

  it('creates a terminal when none are available', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()

    const task = db.createTask({ runId, spec: 'work' })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50
    })

    const runPromise = coordinator.run()

    await vi.advanceTimersByTimeAsync(100)

    expect(runtime.createdTerminals.length).toBe(1)
    expect(runtime.createdTerminalOptions[0]).not.toHaveProperty('presentation')

    insertWorkerDone(db, { taskId: task.id, from: runtime.createdTerminals[0] })

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('completed')
  })

  it('handles escalation and circuit breaker', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [
      { handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true },
      { handle: 'term_b', worktreeId: 'wt1', connected: true, writable: true }
    ]

    const task = db.createTask({
      runId,
      spec: 'risky work'
    })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50
    })

    const runPromise = coordinator.run()

    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(100)
      const dispatch = db.getDispatchContext(task.id)
      expect(dispatch).toBeDefined()
      db.insertMessage({
        runId,
        from: dispatch?.assignee_handle ?? 'missing-worker',
        to: 'coord',
        subject: `Failed attempt ${i + 1}`,
        type: 'escalation',
        payload: JSON.stringify({ taskId: task.id, dispatchId: dispatch!.id })
      })
    }

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('failed')
    expect(result.failedTasks).toContain(task.id)
  })

  it('reports failed when dispatch send failures circuit-break in the DB', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]
    runtime.sendTerminalAgentPrompt = async () => {
      throw new Error('terminal_not_writable')
    }

    const task = db.createTask({
      runId,
      spec: 'cannot dispatch'
    })
    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 10
    })

    const result = await settleCoordinatorRun(coordinator.run())

    expect(result.status).toBe('failed')
    expect(result.failedTasks).toContain(task.id)
    expect(db.getTask(task.id)?.status).toBe('failed')
  })

  it('handles decision gate blocking and resolution', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]

    const task = db.createTask({
      runId,
      spec: 'needs approval'
    })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50
    })

    const runPromise = coordinator.run()

    await vi.advanceTimersByTimeAsync(100)

    const dispatch = db.getDispatchContext(task.id)
    expect(dispatch).toBeDefined()
    db.insertMessage({
      runId,
      from: 'term_a',
      to: 'coord',
      subject: 'Need approval',
      type: 'decision_gate',
      payload: JSON.stringify({
        taskId: task.id,
        dispatchId: dispatch!.id,
        question: 'Proceed with destructive migration?',
        options: ['yes', 'no']
      })
    })

    await vi.advanceTimersByTimeAsync(100)

    const blocked = db.getTask(task.id)
    expect(blocked?.status).toBe('blocked')
    expect(db.getActiveDispatchForTerminal('term_a')).toBeUndefined()

    const gates = db.listGates({ taskId: task.id, status: 'pending' })
    expect(gates.length).toBe(1)
    db.resolveGate(gates[0].id, 'yes')

    await vi.advanceTimersByTimeAsync(200)

    insertWorkerDone(db, { taskId: task.id })

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('completed')
    expect(result.completedTasks).toContain(task.id)
  })

  it('respects task DAG ordering', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]

    const t1 = db.createTask({ runId, spec: 'first' })
    const t2 = db.createTask({
      runId,
      spec: 'second',
      deps: [t1.id]
    })

    expect(t2.status).toBe('pending')

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50
    })

    const runPromise = coordinator.run()

    await vi.advanceTimersByTimeAsync(100)

    expect(db.getTask(t2.id)?.status).toBe('pending')

    insertWorkerDone(db, { taskId: t1.id })

    await vi.advanceTimersByTimeAsync(200)

    const t2Status = db.getTask(t2.id)?.status
    expect(t2Status === 'dispatched' || t2Status === 'ready').toBe(true)

    insertWorkerDone(db, { taskId: t2.id })

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('completed')
    expect(result.completedTasks).toContain(t1.id)
    expect(result.completedTasks).toContain(t2.id)
  })

  it('dispatches higher-priority ready tasks first', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]

    const low = db.createTask({ runId, spec: 'low', priority: 1 })
    const high = db.createTask({ runId, spec: 'high', priority: 5 })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50,
      maxConcurrent: 1
    })

    const runPromise = coordinator.run()

    await vi.advanceTimersByTimeAsync(100)

    expect(db.getTask(high.id)?.status).toBe('dispatched')
    expect(db.getTask(low.id)?.status).toBe('ready')

    insertWorkerDone(db, { taskId: high.id })
    await vi.advanceTimersByTimeAsync(200)
    insertWorkerDone(db, { taskId: low.id })

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('completed')
    expect(result.completedTasks).toContain(high.id)
    expect(result.completedTasks).toContain(low.id)
  })

  it('escalates a stale heartbeat once per dispatch', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]
    const logs: string[] = []

    const task = db.createTask({ runId, spec: 'long work' })
    const dispatch = createRootDispatch(db, task.id, 'term_a')
    db.recordHeartbeat(dispatch.id, '2026-05-03T00:00:00.000Z')

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50,
      onLog: (msg) => logs.push(msg)
    })

    const runPromise = coordinator.run()
    await vi.advanceTimersByTimeAsync(200)
    coordinator.stop()

    const result = await settleCoordinatorRun(runPromise)
    const stale = result.escalations.filter((m) => m.subject.startsWith('stale_heartbeat'))
    expect(stale.length).toBe(1)
    expect(stale[0].payload).toContain(dispatch.id)
    expect(logs.some((line) => line.includes('Stale heartbeat'))).toBe(true)
  })

  it('respects maxConcurrent limit', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [
      { handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true },
      { handle: 'term_b', worktreeId: 'wt1', connected: true, writable: true },
      { handle: 'term_c', worktreeId: 'wt1', connected: true, writable: true }
    ]

    const t1 = db.createTask({ runId, spec: 'one' })
    const t2 = db.createTask({ runId, spec: 'two' })
    const t3 = db.createTask({ runId, spec: 'three' })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50,
      maxConcurrent: 2
    })

    const runPromise = coordinator.run()

    await vi.advanceTimersByTimeAsync(100)

    const dispatched = db.listTasks({ status: 'dispatched' })
    expect(dispatched.length).toBe(2)

    for (const task of [t1, t2, t3]) {
      insertWorkerDone(db, { taskId: task.id })
      await vi.advanceTimersByTimeAsync(100)
    }

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('completed')
  })

  it('uses a Run-level max-concurrent over the coordinator default', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [
      { handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true },
      { handle: 'term_b', worktreeId: 'wt1', connected: true, writable: true },
      { handle: 'term_c', worktreeId: 'wt1', connected: true, writable: true }
    ]

    const run = db.createRun({
      objective: 'capped',
      coordinatorHandle: 'coord',
      coordinatorPaneKey: null
    })
    db.db.prepare('UPDATE runs SET max_concurrent = 1 WHERE id = ?').run(run.id)

    const t1 = db.createTask({ runId: run.id, spec: 'one' })
    const t2 = db.createTask({ runId: run.id, spec: 'two' })
    const t3 = db.createTask({ runId: run.id, spec: 'three' })

    // Default would allow 4, but the Run caps at 1.
    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50,
      maxConcurrent: 4
    })

    const runPromise = coordinator.run()

    await vi.advanceTimersByTimeAsync(100)
    expect(db.listTasks({ status: 'dispatched' }).length).toBe(1)

    for (const task of [t1, t2, t3]) {
      insertWorkerDone(db, { taskId: task.id })
      await vi.advanceTimersByTimeAsync(100)
    }

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('completed')
  })

  it('ignores stale worker_done from a failed retry before accepting the active dispatch', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    const logs: string[] = []

    const task = db.createTask({
      runId,
      spec: 'retry-sensitive work'
    })
    const staleCtx = createRootDispatch(db, task.id, 'term_old')
    db.failDispatch(staleCtx.id, 'retry elsewhere')
    const activeCtx = createRootDispatch(db, task.id, 'term_current')

    db.insertMessage({
      runId,
      from: 'term_old',
      to: 'coord',
      subject: 'Late done',
      type: 'worker_done',
      payload: JSON.stringify({
        taskId: task.id,
        dispatchId: staleCtx.id,
        outcome: 'succeeded'
      })
    })

    const staleCoordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 20,
      onLog: (m) => logs.push(m)
    })
    const staleRun = staleCoordinator.run()
    await vi.advanceTimersByTimeAsync(80)
    staleCoordinator.stop()
    await settleCoordinatorRun(staleRun)

    expect(db.getTask(task.id)?.status).toBe('dispatched')
    expect(db.getDispatchContextById(staleCtx.id)?.status).toBe('failed')
    expect(db.getDispatchContextById(activeCtx.id)?.status).toBe('dispatched')
    expect(logs.some((m) => m.includes('inactive dispatch'))).toBe(true)

    insertWorkerDone(db, {
      taskId: task.id,
      from: 'term_current',
      dispatchId: activeCtx.id
    })
    const completionCoordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 20
    })
    const result = await settleCoordinatorRun(completionCoordinator.run())

    expect(result.status).toBe('completed')
    expect(db.getTask(task.id)?.status).toBe('completed')
    expect(db.getDispatchContextById(activeCtx.id)?.status).toBe('completed')
  })

  it('accepts worker_done pane provenance after an assignee handle changes', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    const logs: string[] = []

    const task = db.createTask({
      runId,
      spec: 'owned work'
    })
    const leafId = '11111111-1111-4111-8111-111111111111'
    const ctx = createRootDispatch(db, task.id, 'term_owner', `tab_before:${leafId}`)

    db.insertMessage({
      runId,
      from: 'term_reminted',
      to: 'coord',
      subject: 'Done after restart',
      type: 'worker_done',
      payload: JSON.stringify({ taskId: task.id, dispatchId: ctx.id, outcome: 'succeeded' }),
      senderPaneKey: `tab_after:${leafId}`
    })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 20,
      onLog: (m) => logs.push(m)
    })
    const result = await settleCoordinatorRun(coordinator.run())

    expect(result.status).toBe('completed')
    expect(db.getTask(task.id)?.status).toBe('completed')
    expect(db.getDispatchContextById(ctx.id)?.status).toBe('completed')
    expect(logs.some((m) => m.includes('Task') && m.includes('completed'))).toBe(true)
  })

  it('can be stopped', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    db.createTask({ runId, spec: 'never finishes' })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50
    })

    const runPromise = coordinator.run()

    await vi.advanceTimersByTimeAsync(100)
    coordinator.stop()

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('failed')
  })
})
