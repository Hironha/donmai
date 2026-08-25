type InferRunOk<R> = R extends RunOk<any> ? R : never;

export type RunResult<T, E> = RunOk<T> | RunError<E>;

export class RunOk<T> {
  public readonly ok: true;
  public readonly value: T;

  constructor(value: T) {
    this.ok = true;
    this.value = value;
  }

  static empty(): RunOk<void> {
    return new RunOk(undefined);
  }

  static unwrap<U, E>(result: RunResult<U, E>): U {
    if (!result.ok) {
      throw new Error("Run ok cannot unwrap error variant");
    }
    return result.value;
  }
}

export class RunError<E> {
  public readonly ok: false;
  public readonly error: E;

  constructor(error: E) {
    this.ok = false;
    this.error = error;
  }

  static empty(): RunError<void> {
    return new RunError(undefined);
  }

  static unwrap<U, E>(result: RunResult<U, E>): E {
    if (result.ok) {
      throw new Error("Run error cannot unwrap ok variant");
    }
    return result.error;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Run context used to control how a workflow behaves.
 */
export class RunContext {
  /** Number of the current attempt. */
  public readonly attempt: number;

  constructor(attempt: number) {
    this.attempt = attempt;
  }

  /**
   * Method that returns a {@link RunError} which tells the `Retry` runner that some
   * error occured and should try it again.
   * @example
   * const retry = new Retry({ attempts: 5 });
   * // run the 5 attempts since always returns a retry
   * const result = retry.run((ctx) => ctx.retry());
   * expect(result).toMatchObject({
   *   ok: false,
   *   error: undefined
   * });
   */
  retry(): RunError<void> {
    return RunError.empty();
  }

  /**
   * Method that returns a {@link RunOk} which tells the `Retry` runner that the
   * execution was successful. May accept a value as argument that is returned as
   * result of the execution.
   * @example
   * const retry = new Retry({ attempts: 5 });
   * const result = retry.run((ctx) => {
   *   if (ctx.attempt === 2) {
   *     return ctx.ok(ctx.attempt);
   *   }
   *   return ctx.retry();
   * });
   *
   * expect(result).toMatchObject({
   *   ok: true,
   *   value: 2
   * });
   */
  ok(): RunOk<void>;
  ok<T>(value: T): RunOk<T>;
  ok<T>(value?: T): RunOk<T | void> {
    return new RunOk(value);
  }
}

export interface RetryExhaustedError {
  kind: "ehxausted";
  attempts: number;
}

export interface RetryFailedError {
  kind: "failed";
  attempt: number;
  error: unknown;
}

export type RetryError = RetryExhaustedError | RetryFailedError;

/**
 * Run context used to control how a workflow behaves.
 */
export class RunAsyncContext extends RunContext {
  /**
   * Method to delay certain amount of time.
   * @param ms Amount of delay in milliseconds.
   */
  async delay(ms: number): Promise<void> {
    await delay(Math.max(ms, 0));
  }
}

export type BaseRunAsyncFn<T = any, E = unknown> = (
  ctx: RunAsyncContext,
) => Promise<RunResult<T, E>> | RunResult<T, E>;

export type BaseRunFn<T = any, E = unknown> = (ctx: RunContext) => RunResult<T, E>;

export type RunFnReturnType<Fn extends BaseRunAsyncFn> =
  ReturnType<Fn> extends Promise<infer R>
    ? InferRunOk<R>["value"]
    : InferRunOk<ReturnType<Fn>>["value"];

export interface RetryAsyncConfig {
  /**
   * Amount of attempts the retry will run. Should be a positive integer.
   */
  attempts: number;
  /**
   * Amount of milliseconds between each attempt. Should be a positive integer.
   */
  delayms?: number;
}

export interface RetryConfig {
  /**
   * amount of attempts the retry will run. should be a positive integer.
   */
  attempts: number;
}

const ATTEMPS_DEFAULT = 1;

/**
 * A synchronous retry operator.
 * @example
 * const retry = new Retry({ attempts: 5 });
 * const result = retry.run((ctx) => {
 *   if (ctx.attempt === 5) {
 *     return ctx.ok(ctx.attempt);
 *   }
 *   return ctx.retry();
 * });
 *
 * expect(result).toMatchObject({
 *   ok: true,
 *   value: 5
 * });
 */
export class Retry {
  public readonly attempts: number;

  constructor(config: RetryConfig) {
    this.attempts = config.attempts;
  }

  run<Fn extends BaseRunFn>(fn: Fn): RunResult<RunFnReturnType<Fn>, RetryError> {
    for (let i = 0; i < this.attempts; i += 1) {
      try {
        const ctx = new RunContext(i + 1);
        const result = fn(ctx);
        if (result.ok) {
          return result;
        }
      } catch (e) {
        const error: RetryFailedError = {
          kind: "failed",
          attempt: i,
          error: e,
        };
        return new RunError(error);
      }
    }

    const error: RetryExhaustedError = {
      kind: "ehxausted",
      attempts: this.attempts,
    };
    return new RunError(error);
  }
}

/**
 * An asynchronous retry operator. Mainly used together with async workflows such
 * as IO dependent workflows.
 * @example
 * const retry = new RetryAsync({ attempts: 5, delayms: 200 });
 * const result = await retry.run((ctx) => {
 *   if (ctx.attempt === 5) {
 *     return ctx.ok(ctx.attempt);
 *   }
 *   return ctx.retry();
 * });
 *
 * expect(result).toMatchObject({
 *   ok: true,
 *   value: 5
 * });
 */
export class RetryAsync {
  /** Total amount of attempts. */
  public readonly attempts: number;
  /** Amount of milliseconds between each attempt. */
  public readonly delayms?: number;

  constructor(config: RetryAsyncConfig) {
    this.attempts = config.attempts ?? ATTEMPS_DEFAULT;
    if (this.attempts <= 0) {
      this.attempts = ATTEMPS_DEFAULT;
    } else if (!Number.isInteger(this.attempts)) {
      this.attempts = Math.floor(this.attempts) || ATTEMPS_DEFAULT;
    }

    if (config.delayms && config.delayms > 0) {
      this.delayms = config.delayms;
    }
  }

  /**
   * Method to run the received async workflow.
   * @example
   * const retry = new RetryAsync({ attempts: 5, delayms: 200 });
   * const result = await retry.run((ctx) => {
   *   if (ctx.attempt === 5) {
   *     return ctx.ok(ctx.attempt);
   *   }
   *   return ctx.retry();
   * });
   *
   * expect(result).toMatchObject({
   *   ok: true,
   *   value: 5
   * });
   */
  async run<Fn extends BaseRunAsyncFn>(
    fn: Fn,
  ): Promise<RunResult<RunFnReturnType<Fn>, RetryError>> {
    for (let i = 0; i < this.attempts; i += 1) {
      try {
        const ctx = new RunAsyncContext(i + 1);
        const result = await fn(ctx);
        if (result.ok) {
          return result;
        }

        if (this.delayms && i < this.attempts - 1) {
          await delay(this.delayms);
        }
      } catch (e) {
        const error: RetryFailedError = {
          kind: "failed",
          attempt: i,
          error: e,
        };
        return new RunError(error);
      }
    }

    const error: RetryExhaustedError = {
      kind: "ehxausted",
      attempts: this.attempts,
    };
    return new RunError(error);
  }
}
