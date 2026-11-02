import type { OrchestrationDb } from '../orchestration-db'

/** Tasks dispatch by priority, then creation order. */
export function migrateV47(this: OrchestrationDb, current: number): void {
  if (current >= 47) {
    return
  }
  if (!this.hasColumn('tasks', 'priority')) {
    this.db.exec('ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 0')
  }
  this.db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_ready_priority
      ON tasks(status, priority DESC, created_at);
  `)
}
