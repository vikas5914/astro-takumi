/**
 * Bounded-concurrency runner. Replaces unbounded Promise.all fan-out so we
 * control memory (HTML + DOM + JSX trees resident at once) and CPU overlap.
 * A worker rejection rejects runPool (remaining queued items are not started).
 */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const size = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;
  const runners: Promise<void>[] = [];
  for (let i = 0; i < size; i++) {
    runners.push(
      (async (): Promise<void> => {
        for (;;) {
          const index = cursor++;
          if (index >= items.length) return;
          const item = items[index];
          if (item === undefined) return; // noUncheckedIndexedAccess guard
          await worker(item, index);
        }
      })(),
    );
  }
  await Promise.all(runners);
}
