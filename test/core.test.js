import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithContext, getContext, patchContext } from '../src/index.js';

test('getContext returns undefined outside of any scope', () => {
  assert.equal(getContext(), undefined);
});

test('runWithContext installs the context for the synchronous call', () => {
  const ctx = { traceId: 'abc' };
  const seen = runWithContext(ctx, () => getContext());
  assert.equal(seen, ctx);
});

test('runWithContext returns the callback return value', () => {
  const result = runWithContext({ n: 1 }, () => 42);
  assert.equal(result, 42);
});

test('context is restored after the scope exits', () => {
  const outer = { name: 'outer' };
  runWithContext(outer, () => {
    assert.equal(getContext(), outer);
  });
  assert.equal(getContext(), undefined);
});

test('nested scopes shadow the outer context', () => {
  const outer = { name: 'outer' };
  const inner = { name: 'inner' };
  runWithContext(outer, () => {
    assert.equal(getContext(), outer);
    runWithContext(inner, () => {
      assert.equal(getContext(), inner);
    });
    assert.equal(getContext(), outer);
  });
});

test('context propagates across await boundaries', async () => {
  const ctx = { traceId: 'async-1' };
  await runWithContext(ctx, async () => {
    await Promise.resolve();
    assert.equal(getContext(), ctx);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(getContext(), ctx);
  });
});

test('context propagates into a detached promise chain started inside the scope', async () => {
  const ctx = { traceId: 'detached' };
  let chained;
  await runWithContext(ctx, () => {
    chained = Promise.resolve().then(() => getContext());
  });
  // The scope has exited, but the chain captured the store at creation time.
  assert.equal(await chained, ctx);
});

test('two concurrent scopes do not leak into each other', async () => {
  const a = { traceId: 'a' };
  const b = { traceId: 'b' };
  const results = await Promise.all([
    runWithContext(a, async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return getContext().traceId;
    }),
    runWithContext(b, async () => {
      await Promise.resolve();
      return getContext().traceId;
    }),
  ]);
  assert.deepEqual(results, ['a', 'b']);
});

test('patchContext merges fields and returns the same object', () => {
  const ctx = { a: 1 };
  runWithContext(ctx, () => {
    const returned = patchContext({ b: 2 });
    assert.equal(returned, ctx);
    assert.deepEqual(returned, { a: 1, b: 2 });
    assert.equal(getContext(), ctx);
  });
});

test('patchContext overwrites existing fields', () => {
  const ctx = { level: 'info' };
  runWithContext(ctx, () => {
    patchContext({ level: 'debug' });
    assert.equal(getContext().level, 'debug');
  });
});

test('patchContext mutations are visible to the caller after the scope exits', () => {
  const ctx = { count: 0 };
  runWithContext(ctx, () => {
    patchContext({ count: 7 });
  });
  assert.equal(ctx.count, 7);
});

test('patchContext throws when there is no active context', () => {
  assert.throws(() => patchContext({ a: 1 }), /no active context/);
});

test('runWithContext rejects a non-object context', () => {
  assert.throws(() => runWithContext('nope', () => {}), TypeError);
  assert.throws(() => runWithContext(null, () => {}), TypeError);
  assert.throws(() => runWithContext(7, () => {}), TypeError);
});

test('runWithContext rejects a non-function callback', () => {
  assert.throws(() => runWithContext({}, 'not a function'), TypeError);
});

test('patchContext rejects a non-object patch', () => {
  runWithContext({}, () => {
    assert.throws(() => patchContext(null), TypeError);
    assert.throws(() => patchContext(3), TypeError);
  });
});

test('an error thrown inside the scope still restores the outer context', () => {
  assert.equal(getContext(), undefined);
  assert.throws(() => {
    runWithContext({ a: 1 }, () => {
      throw new Error('boom');
    });
  }, /boom/);
  assert.equal(getContext(), undefined);
});

test('a rejected async scope still restores the outer context', async () => {
  await assert.rejects(
    runWithContext({ a: 1 }, async () => {
      throw new Error('async boom');
    }),
    /async boom/,
  );
  assert.equal(getContext(), undefined);
});
