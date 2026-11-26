# async-hook-local-context

Scoped per-async-caller storage built on `AsyncLocalStorage`, for request-scoped
observability data such as trace ids and loggers.

```js
import { runWithContext, getContext, patchContext } from 'async-hook-local-context';

await runWithContext({ traceId: 'req-42' }, async () => {
  // Deep inside your call stack, no plumbing required:
  getContext().traceId; // 'req-42'

  // Add a field once you know it, e.g. after resolving a user:
  patchContext({ userId: 'u-7' });

  await Promise.resolve();
  getContext().userId; // 'u-7'
});

getContext(); // undefined outside any scope
```

## Why this exists

The alternative is threading a `ctx` argument through every function between
the HTTP handler and the code that emits a log line. That plumbing is noisy and
easy to forget. `AsyncLocalStorage` lets the runtime carry the context for you,
so a logger deep in a database helper can read the trace id of the request that
triggered it without any of the intermediate layers knowing about it.

The trade-off: the context is process-global and implicit. A function that reads
`getContext()` cannot be understood from its signature alone, and nothing stops
two unrelated subsystems from writing the same field name. Keep the shape of the
context small and documented, and prefer passing explicit arguments for anything
that is genuinely part of a function's contract.

## The awkward edge

`patchContext` mutates the stored object in place and returns it. It does not
replace the store, because `AsyncLocalStorage` gives you no way to swap the
stored value from inside a scope: the only handle you have is the reference you
were given. So `const a = getContext(); patchContext({ x: 1 }); a.x === 1` holds.
If you need immutability, copy the context yourself before handing it out.

`patchContext` throws when there is no active context. Call it only from inside
`runWithContext`; a silent no-op would turn a forgotten wrapper into a missing
log field that is hard to trace back.

`getContext` returns `undefined` outside any scope rather than throwing, so
observability helpers can be shared with background jobs and tests that never
establish a context.

## API

- `runWithContext(context, fn)` — runs `fn` with `context` installed. Returns
  whatever `fn` returns, including a promise. `context` must be a non-null
  object; `fn` must be a function.
- `getContext()` — returns the current context object, or `undefined`.
- `patchContext(patch)` — merges `patch` into the current context and returns
  it. Throws if there is no active context or `patch` is not a non-null object.
