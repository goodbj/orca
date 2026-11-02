import { parseOrchestrationTaskDepsFlag } from '../../../../orchestration/task-deps-flag'
import { orchestrationCallerIdentity, resolveRunScope } from '../runs/run-scope'
import type { TaskCreateParams } from '../schemas'
import type { z } from 'zod'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type { OrchestrationSessionCaller } from '../../../../orchestration/orchestration-caller-identity'
import type { OrchestrationCompatibilityEvidence } from '../../../../../../shared/orchestration-compatibility-evidence'

type TaskCreateDeps = {
  runtime: OrcaRuntimeService
  orchestrationCaller?: OrchestrationSessionCaller
  orchestrationCompatibilityEvidence?: OrchestrationCompatibilityEvidence
  legacyCoordinatorRunId?: string
}

export function createTaskInRunScope(
  params: z.infer<typeof TaskCreateParams>,
  {
    runtime,
    orchestrationCaller,
    orchestrationCompatibilityEvidence,
    legacyCoordinatorRunId
  }: TaskCreateDeps
) {
  const db = runtime.getOrchestrationDb()
  const deps = params.deps ? parseOrchestrationTaskDepsFlag(params.deps) : undefined
  const run = resolveRunScope(runtime, {
    runId: params.run,
    callerTerminalHandle: params.callerTerminalHandle,
    requireCurrentConsumer: true,
    legacyCoordinatorRunId,
    callerEvidence: orchestrationCompatibilityEvidence,
    callerSession: orchestrationCaller
  })
  // A handle-less session creates root Tasks: Task lineage is recorded by terminal only.
  const creatorHandle = params.callerTerminalHandle
    ? orchestrationCallerIdentity(runtime, {
        handle: params.callerTerminalHandle,
        session: orchestrationCaller,
        paneKey: null
      }).terminalHandle
    : null
  const creatorAuthority = creatorHandle
    ? runtime.getOrchestrationDispatchAuthority(creatorHandle)
    : null
  const task = db.createTask({
    spec: params.spec,
    taskTitle: params.taskTitle,
    displayName: params.displayName,
    deps,
    parentId: params.parent,
    priority: params.priority,
    createdByTerminalHandle: creatorHandle ?? undefined,
    ...(creatorAuthority?.paneKey && creatorAuthority.processIncarnation
      ? {
          createdByPaneKey: creatorAuthority.paneKey,
          createdByProcessIncarnation: creatorAuthority.processIncarnation,
          createdByRunGeneration: run.consumer_generation
        }
      : {}),
    runId: run.id
  })
  return { task }
}
