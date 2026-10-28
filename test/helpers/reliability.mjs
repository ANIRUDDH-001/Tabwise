// D-51: synchronize at observable boundaries; never infer progress from a short sleep.
import assert from 'node:assert/strict';

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function reached(event, operation, what) {
  return Promise.race([event, operation.then(
    () => { throw new Error(`operation settled before ${what}`); },
    (cause) => { throw new Error(`operation rejected before ${what}: ${cause.message}`, { cause }); },
  )]);
}

export function assertPass(summary, state = {}) {
  assert.equal(summary?.result, 'PASS', JSON.stringify({
    reasons: summary?.result_reasons, guard: summary?.send_guard,
    reached: { attempt: state.current?.attempt, step: state.step },
    attempts: state.attempts?.map((a) => ({ attempt: a.attempt, status: a.status, error: a.error,
      later_errors: a.later_errors, cleanup_errors: a.cleanup_errors, actions_started: a.actions_started,
      last_record: a.records?.at(-1) })),
  }, null, 2));
}

export function exactError(message, cause) {
  return (error) => {
    assert.equal(error?.constructor, Error);
    assert.equal(error.message, message);
    if (cause !== undefined) {
      assert.equal(error.cause?.constructor, Error);
      assert.equal(error.cause.message, cause);
    }
    return true;
  };
}
