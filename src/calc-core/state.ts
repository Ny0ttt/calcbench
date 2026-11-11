// Stateful operations over an injected Store. The memory register and tape are
// the airtight invocation proofs: the model cannot know their contents without
// actually calling these tools.
import type { Store } from "./store.ts";

const MEM = "mem";
const TAPE = "tape";

export async function memAdd(store: Store, n: number): Promise<number> {
  const cur = await store.getNumber(MEM);
  const next = cur + n;
  await store.setNumber(MEM, next);
  return next;
}
export async function memRead(store: Store): Promise<number> { return store.getNumber(MEM); }
export async function memClear(store: Store): Promise<void> { await store.setNumber(MEM, 0); }

export async function tapePush(store: Store, value: number): Promise<void> {
  await store.pushList(TAPE, value);
}
export async function tapeList(store: Store): Promise<number[]> { return store.getList(TAPE); }
export async function tapeSum(store: Store): Promise<number> {
  const l = await store.getList(TAPE);
  return l.reduce((a, b) => a + b, 0);
}
export async function tapeClear(store: Store): Promise<void> { await store.clearList(TAPE); }
