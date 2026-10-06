/** What a failure is recorded as.
 *
 * A job's last_error and the logs carry what was called and how it answered, or which record was
 * missing — never the body of an answer, which can quote the text being written or the person it
 * is about. */

/** A call to another service that did not succeed: the path and the status, nothing else. */
export class UpstreamError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    /** The text API no longer knows the section it was asked to write. */
    readonly unknownSection = false,
  ) {
    super(`${path} → ${status}`);
    this.name = 'UpstreamError';
  }
}

/** Something this worker found missing or inconsistent. The message names ids, never data. */
export class JobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobError';
  }
}

/** The short code a failure is stored and logged as. Anything not raised as one of the two kinds
 * above is reported by its class alone: its message could carry anything. */
export function errorCode(error: unknown): string {
  if (error instanceof UpstreamError || error instanceof JobError) return error.message.slice(0, 200);
  return error instanceof Error ? `internal ${error.name}` : 'internal';
}
