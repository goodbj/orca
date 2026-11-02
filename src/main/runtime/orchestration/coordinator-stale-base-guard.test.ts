import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from './db'
import { Coordinator } from './coordinator'
import { DISPATCH_STALE_THRESHOLD } from './coordinator-stale-base-flag'
import {
  runId,
  createMockRuntime,
  insertWorkerDone,
  settleCoordinatorRun
} from './coordinator.test-helpers'

describe('Coordinator stale-base dispatch guard', () => {
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

  it('threads drift into the preamble when behind > 0 and under threshold', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]
    runtime.setProbeDrift({
      base: 'origin/main',
      behind: 5,
      recentSubjects: ['fix A', 'fix B', 'fix C']
    })

    const task = db.createTask({
      runId,
      spec: 'do the work'
    })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50,
      worktree: 'wt1'
    })

    const runPromise = coordinator.run()
    await vi.advanceTimersByTimeAsync(100)

    insertWorkerDone(db, { taskId: task.id })

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('completed')
    expect(runtime.probeDriftCalls).toContain('wt1')
    const sent = runtime.sentMessages.find((m) => m.handle === 'term_a')
    expect(sent).toBeDefined()
    expect(sent!.text).toContain('--- BASE DRIFT ---')
    expect(sent!.text).toContain('5 commits behind origin/main')
    expect(sent!.text).toContain('fix A')
  })

  it('silently skips dispatch when drift > threshold and allow-stale-base is absent', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]
    runtime.setProbeDrift({
      base: 'origin/main',
      behind: DISPATCH_STALE_THRESHOLD + 10,
      recentSubjects: ['fix A']
    })

    const task = db.createTask({
      runId,
      spec: 'do the work'
    })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50,
      worktree: 'wt1'
    })

    const runPromise = coordinator.run()
    await vi.advanceTimersByTimeAsync(250)
    coordinator.stop()
    const result = await settleCoordinatorRun(runPromise)

    // A recoverable stale base must leave the task ready without consuming circuit-breaker budget.
    expect(runtime.sentMessages).toHaveLength(0)
    expect(db.getTask(task.id)?.status).toBe('ready')
    expect(db.getDispatchContext(task.id)).toBeUndefined()
    // External stop fails the run while leaving the undispatched task out of failedTasks.
    expect(result.status).toBe('failed')
    expect(result.failedTasks).not.toContain(task.id)
  })

  it('proceeds with stripped spec + drift section when allow-stale-base overrides', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]
    runtime.setProbeDrift({
      base: 'origin/main',
      behind: 200,
      recentSubjects: ['commit 1', 'commit 2']
    })

    const spec = `Investigate issue #42
allow-stale-base: true`
    const task = db.createTask({ runId, spec })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50,
      worktree: 'wt1'
    })

    const runPromise = coordinator.run()
    await vi.advanceTimersByTimeAsync(100)

    insertWorkerDone(db, { taskId: task.id })

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('completed')
    const sent = runtime.sentMessages.find((m) => m.handle === 'term_a')
    expect(sent).toBeDefined()
    expect(sent!.text).toContain('--- BASE DRIFT ---')
    expect(sent!.text).toContain('200 commits behind origin/main')
    expect(sent!.text).toContain('Investigate issue #42')
    expect(sent!.text).not.toContain('allow-stale-base: true')
  })

  it('proceeds without drift section when probeWorktreeDrift returns null', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]
    runtime.setProbeDrift(null)

    const task = db.createTask({
      runId,
      spec: 'do the work'
    })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50,
      worktree: 'wt1'
    })

    const runPromise = coordinator.run()
    await vi.advanceTimersByTimeAsync(100)

    insertWorkerDone(db, { taskId: task.id })

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('completed')
    const sent = runtime.sentMessages.find((m) => m.handle === 'term_a')
    expect(sent).toBeDefined()
    expect(sent!.text).not.toContain('--- BASE DRIFT ---')
  })

  it('does not call probeWorktreeDrift when coordinator has no worktree selector', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]
    const logs: string[] = []

    const task = db.createTask({
      runId,
      spec: 'do the work'
    })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50,
      onLog: (msg) => logs.push(msg)
    })

    const runPromise = coordinator.run()
    await vi.advanceTimersByTimeAsync(100)

    insertWorkerDone(db, { taskId: task.id })

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('completed')
    expect(runtime.probeDriftCalls).toHaveLength(0)
    expect(logs.some((m) => m.includes('stale-base guard inert'))).toBe(true)
    expect(runtime.sentMessages.length).toBeGreaterThan(0)
  })

  it('proceeds without drift when probeWorktreeDrift throws', async () => {
    db = new OrchestrationDb(':memory:')
    const runtime = createMockRuntime()
    runtime.terminals = [{ handle: 'term_a', worktreeId: 'wt1', connected: true, writable: true }]
    runtime.throwProbeDrift = new Error('boom')

    const task = db.createTask({
      runId,
      spec: 'do the work'
    })

    const coordinator = new Coordinator(db, runtime, {
      spec: 'go',
      coordinatorHandle: 'coord',
      pollIntervalMs: 50,
      worktree: 'wt1'
    })

    const runPromise = coordinator.run()
    await vi.advanceTimersByTimeAsync(100)

    insertWorkerDone(db, { taskId: task.id })

    const result = await settleCoordinatorRun(runPromise)
    expect(result.status).toBe('completed')
    const sent = runtime.sentMessages.find((m) => m.handle === 'term_a')
    expect(sent!.text).not.toContain('--- BASE DRIFT ---')
  })
})
