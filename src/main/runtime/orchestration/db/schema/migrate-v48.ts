import type { OrchestrationDb } from '../orchestration-db'

/** Runs may carry an explicit per-run concurrent-dispatch cap. */
export function migrateV48(this: OrchestrationDb, current: number): void {
  if (current >= 48) {
    return
  }
  if (!this.hasColumn('runs', 'max_concurrent')) {
    this.db.exec(`ALTER TABLE runs ADD COLUMN max_concurrent INTEGER`)
  }
}
