/**
 * Mark a promise as one whose rejection is dealt with elsewhere.
 *
 * The report is assembled from requests that all run at once, so the first
 * failure ends the attempt while its siblings are still in flight. A promise
 * that rejects with no handler attached *at that moment* is reported as an
 * unhandled rejection — a console error in the browser, a warning in Node,
 * and noise in any error reporter listening for them.
 *
 * Attaching a handler here does not consume the rejection: whoever awaits the
 * promise afterwards still sees it, and still has to deal with it.
 */
export function quiet<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {});
  return promise;
}
