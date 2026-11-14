import type { Actor, Command, DomainState, Scope } from '@king-david/contracts';
import { assertScope } from '@king-david/policy';
import { createSeed } from './seed';
import { execute, type ExecutionResult } from './engine';

export interface Repository {
  read(actor: Actor, scope: Scope): Promise<DomainState>;
  transact(actor: Actor, scope: Scope, command: Command): Promise<ExecutionResult>;
}
/** TEST/DEMO ONLY. Never use this adapter for real guest or payment information. */
export class MemoryRepository implements Repository {
  private state: DomainState;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(seed = createSeed(), private demo = true) { this.state = seed; }
  async read(actor: Actor, scope: Scope) { assertScope(actor, scope); return structuredClone(this.state); }
  async transact(actor: Actor, scope: Scope, command: Command): Promise<ExecutionResult> {
    const task = this.queue.then(() => {
      const result = execute(this.state, actor, scope, command, { demo: this.demo });
      this.state = result.state;
      return { ...result, state: structuredClone(result.state) };
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
}
