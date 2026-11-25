/**
 * Public entry point for async-hook-local-context.
 *
 * We re-export from core.js rather than re-implementing so that there is
 * exactly one AsyncLocalStorage instance in the process. Two separate
 * instances would silently produce two disjoint contexts, which is the kind
 * of bug that only shows up in production.
 */
export { runWithContext, getContext, patchContext } from './core.js';
