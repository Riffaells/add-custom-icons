/**
 * Runs `worker` over `items` with at most `concurrency` calls in flight at
 * once. Unlike batching (start N, await all N, start the next N), a slot that
 * finishes early immediately picks up the next item - one slow item no
 * longer stalls the rest of an otherwise-finished batch.
 */
export async function runWithConcurrency<T, R>(
	items: readonly T[],
	worker: (item: T, index: number) => Promise<R>,
	concurrency: number,
	yieldEveryMs = 16
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	let lastYield = performance.now();

	async function runSlot(): Promise<void> {
		while (nextIndex < items.length) {
			const i = nextIndex++;
			results[i] = await worker(items[i], i);

			// Time-based yielding (rather than every N items) keeps the UI
			// responsive without paying the ~4ms setTimeout clamp on every
			// single batch boundary.
			const now = performance.now();
			if (now - lastYield >= yieldEveryMs) {
				lastYield = now;
				await new Promise(resolve => window.setTimeout(resolve, 0));
			}
		}
	}

	const slotCount = Math.min(concurrency, items.length);
	await Promise.all(Array.from({length: slotCount}, () => runSlot()));

	return results;
}
