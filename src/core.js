import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * A single process-wide store. AsyncLocalStorage is designed to be created
 * once and reused: creating one per call would defeat the whole point of the
 * async context tracking, since the store identity is what ties a callback
 * to its caller's context.
 */
const storage = new AsyncLocalStorage();

/**
 * Run `fn` with `initialContext` installed as the ambient context.
 *
 * The context object is stored by reference. `runWithContext` does not clone
 * it, because cloning would break the common case of mutating a request-scoped
 * bag of fields (a logger, a trace id, timing marks) from deep inside a call
 * stack and having those mutations visible to the caller after `fn` resolves.
 *
 * Returns whatever `fn` returns. If `fn` returns a promise, the context stays
 * active for the whole lifetime of that promise, including any `.then`
 * continuations scheduled from inside it.
 *
 * `initialContext` must be a non-null object. Passing a primitive here is a
 * programming error: the only way to read it back later is `getContext`, and
 * a primitive carries no identity to mutate, so callers would be surprised
 * when `patchContext` silently did nothing.
 */
export function runWithContext(initialContext, fn) {
  if (initialContext === null || typeof initialContext !== 'object') {
    throw new TypeError('runWithContext: initialContext must be a non-null object');
  }
  if (typeof fn !== 'function') {
    throw new TypeError('runWithContext: fn must be a function');
  }
  return storage.run(initialContext, fn);
}

/**
 * Read the context installed by the nearest enclosing `runWithContext`.
 *
 * Returns `undefined` when called outside any `runWithContext` scope. We
 * return `undefined` rather than throwing because observability helpers are
 * frequently called from code that also runs outside a request (background
 * jobs, module top-level, tests) and forcing every call site to guard with a
 * try/catch would be hostile.
 */
export function getContext() {
  return storage.getStore();
}

/**
 * Merge `patch` into the current context and return the merged object.
 *
 * Two behaviours are worth calling out, because they are the ones a reader
 * will trip over:
 *
 * 1. `patchContext` mutates AND returns the same object. The store holds a
 *    reference, so there is no way to replace the stored object from inside
 *    the scope; mutating in place is the only mechanism that works, and it
 *    keeps the return value useful for `const ctx = patchContext({...})`.
 *
 * 2. It throws if there is no active context. Silently doing nothing would
 *    hide the bug where a caller forgot to wrap their work in
 *    `runWithContext`, and the resulting missing log fields are painful to
 *    trace back to their source.
 */
export function patchContext(patch) {
  const current = storage.getStore();
  if (current === undefined) {
    throw new Error('patchContext: no active context; call runWithContext first');
  }
  if (patch === null || typeof patch !== 'object') {
    throw new TypeError('patchContext: patch must be a non-null object');
  }
  Object.assign(current, patch);
  return current;
}
