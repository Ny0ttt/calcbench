// Async store interface. Async from day one ON PURPOSE: a later shared-state
// store (for a live-reflecting UI, or a revived Android route) is async, and a
// sync interface here would force rewriting calc-core. The in-memory impl below
// is synchronous under the hood but presents the async contract.

export interface Store {
  getNumber(key: string): Promise<number>;      // defaults to 0 if unset
  setNumber(key: string, value: number): Promise<void>;
  pushList(key: string, value: number): Promise<void>;
  getList(key: string): Promise<number[]>;
  clearList(key: string): Promise<void>;
}

export class InMemoryStore implements Store {
  private nums = new Map<string, number>();
  private lists = new Map<string, number[]>();

  async getNumber(key: string): Promise<number> { return this.nums.get(key) ?? 0; }
  async setNumber(key: string, value: number): Promise<void> { this.nums.set(key, value); }
  async pushList(key: string, value: number): Promise<void> {
    const l = this.lists.get(key) ?? [];
    l.push(value);
    this.lists.set(key, l);
  }
  async getList(key: string): Promise<number[]> { return [...(this.lists.get(key) ?? [])]; }
  async clearList(key: string): Promise<void> { this.lists.delete(key); }
}
