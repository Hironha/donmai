type InferRunOk<R> = R extends RunOk<any> ? R : never;
type InferRunError<R> = R extends RunError<any> ? R : never;

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

/**
 * Run context used to control how a workflow behaves.
 */
export class RunAsyncContext extends RunContext {
  constructor(attempt: number) {
    super(attempt);
  }

  /**
   * Method to delay certain amount of time.
   * @param ms Amount of delay in milliseconds.
   */
  async delay(ms: number): Promise<void> {
    await delay(Math.max(ms, 0));
  }
}

/**
 * On error callback context used to control how the error handling should behave.
 */
export class OnErrorContext {
  /** Number of the current attempt. */
  public readonly attempt: number;
  public readonly error: unknown;

  constructor(attempt: number, error: unknown) {
    this.attempt = attempt;
    this.error = error;
  }

  /**
   * Method that returns a {@link RunOk} which tells the `Retry` to retry the
   * workflow again.
   * @example
   * const retry = new Retry({ attempts: 5 }).onError((ctx) => {
   *   if (ctx.error instanceof Error) {
   *     console.error("Some unexpected error happened: ", ctx.error);
   *     return ctx.retry();
   *   }
   *   return ctx.stop();
   * });
   *
   * let attempts = 0
   * const result = retry.run((ctx) => {
   *   attempts += 1;
   *   throw new Error(`Attempt ${ctx.attempt} not allowed!`);
   * });
   *
   * expect(result).toMatchObject({
   *   ok: false,
   *   error: undefined
   * });
   * expect(attempts).toStrictEqual(5);
   */
  retry(): RunOk<void> {
    return RunOk.empty();
  }

  /**
   * Method that returns a {@link RunError} which tells the `Retry` to stop the
   * workflow. May accept a value as argument that is returned as result of the
   * execution.
   * @example
   * const retry = new Retry({ attempts: 5 }).onError((ctx) => {
   *   if (ctx.error instanceof Error) {
   *     return ctx.stop(ctx.error.message);
   *   }
   *   return ctx.retry();
   * });
   *
   * const result = retry.run((ctx) => {
   *   if (ctx.attempt === 2) {
   *     throw new Error("Unexpected attempt two")
   *   }
   *   return ctx.retry();
   * });
   *
   * expect(result).toMatchObject({
   *   ok: false,
   *   error: "Unexpected attempt two"
   * });
   */
  stop(): RunError<unknown>;
  stop<U>(error: U): RunError<U>;
  stop<U>(error?: U): RunError<unknown | U> {
    if (error !== undefined) {
      return new RunError(error);
    }
    return new RunError(this.error);
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

export type OnErrorAsyncFn<Fb> = (
  ctx: OnErrorContext,
) => Promise<RunResult<void, Fb>> | RunResult<void, Fb>;

export type OnErrorFn<Fb> = (ctx: OnErrorContext) => RunResult<void, Fb>;

export type OnErrorFnReturnType<Fn extends OnErrorAsyncFn<any>> =
  ReturnType<Fn> extends Promise<infer R>
    ? InferRunError<R>["error"]
    : InferRunError<ReturnType<Fn>>["error"];

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
   * Amount of attempts the retry will run. Should be a positive integer.
   */
  attempts: number;
}

interface RetryAsyncPrivateConfig<E, F> {
  fallback: F;
  onError?: OnErrorAsyncFn<E>;
}

interface RetryPrivateConfig<E, F> {
  fallback: F;
  onError?: OnErrorFn<E>;
}

const DEFAULT_ATTEMPTS = 1;

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
export class Retry<E = unknown, F = undefined> {
  /** Total amount of attempts. */
  public readonly attempts: number;

  private cfg: RetryPrivateConfig<E, F>;

  constructor(config: RetryConfig) {
    this.cfg = { fallback: undefined as F };
    this.attempts = config.attempts;
    if (this.attempts <= 0) {
      this.attempts = DEFAULT_ATTEMPTS;
    } else if (!Number.isInteger(this.attempts)) {
      this.attempts = Math.floor(this.attempts) || DEFAULT_ATTEMPTS;
    }
  }

  /**
   * Method to configure a callback to handle errors.
   * @returns {Retry<OnErrorFnReturnType<Fn>, F>} Returns a clone of the {@link Retry} with
   * onError callback configured.
   * @example
   * const retry = new Retry({ attempts: 5 }).onError((ctx) => {
   *   if (ctx.error instanceof Error) {
   *     return ctx.stop(ctx.error.message);
   *   }
   *   return ctx.retry();
   * });
   *
   * const result = retry.run((ctx) => {
   *   if (ctx.attempt % 2 === 0) {
   *     throw new Error("Invalid attempt value!");
   *   }
   *   return ctx.retry();
   * });
   *
   * expect(result).toMatchObject({
   *   ok: false,
   *   error: "Invalid attempt value!"
   * });
   */
  onError<Fn extends OnErrorFn<any>>(fn: Fn): Retry<OnErrorFnReturnType<Fn>, F> {
    const config = this.config();
    const clone = new Retry<OnErrorFnReturnType<Fn>, F>(config);
    clone.cfg.onError = fn;
    clone.cfg.fallback = this.cfg.fallback;
    return clone;
  }

  /**
   * Method to configure a fallback value.
   * @returns {Retry<E, E>} Returns a clone of the {@link Retry} with fallback configured.
   * @example
   * const retry = new Retry({ attempts: 5 }).fallback("Attempts exhausted");
   * const result = retry.run((ctx) => ctx.retry());
   *
   * expect(result).toMatchObject({
   *   ok: false,
   *   error: "Attempts exhausted"
   * });
   */
  fallback(fallback: E): Retry<E, E> {
    const config = this.config();
    const clone = new Retry<E, E>(config);
    clone.cfg.onError = this.cfg.onError!;
    clone.cfg.fallback = fallback;
    return clone;
  }

  /**
   * Method to run the received workflow.
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
  run<Fn extends BaseRunFn>(fn: Fn): RunResult<RunFnReturnType<Fn>, E | F> {
    for (let i = 0; i < this.attempts; i += 1) {
      try {
        const ctx = new RunContext(i + 1);
        const result = fn(ctx);
        if (result.ok) {
          return result;
        }
      } catch (e) {
        if (this.cfg.onError) {
          const ctx = new OnErrorContext(i, e as E);
          const result = this.cfg.onError(ctx);
          if (!result.ok) {
            return result;
          }
        }
      }
    }

    return new RunError(this.cfg.fallback);
  }

  private config(): RetryAsyncConfig {
    return { attempts: this.attempts };
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
export class RetryAsync<E = unknown, F = undefined> {
  /** Total amount of attempts. */
  public readonly attempts: number;
  /** Amount of milliseconds between each attempt. */
  public readonly delayms?: number;

  private cfg: RetryAsyncPrivateConfig<E, F>;

  constructor(config: RetryAsyncConfig) {
    this.cfg = { fallback: undefined as F };
    this.attempts = config.attempts ?? DEFAULT_ATTEMPTS;
    if (this.attempts <= 0) {
      this.attempts = DEFAULT_ATTEMPTS;
    } else if (!Number.isInteger(this.attempts)) {
      this.attempts = Math.floor(this.attempts) || DEFAULT_ATTEMPTS;
    }

    if (config.delayms && config.delayms > 0) {
      this.delayms = config.delayms;
    }
  }

  /**
   * Method to configure a callback to handle errors.
   * @returns {RetryAsync<OnErrorFnReturnType<Fn>, F>} Returns a clone of the {@link RetryAsync} with
   * onError callback configured.
   * @example
   * const retry = new RetryAsync({ attempts: 5, delayms: 200 })
   *   .onError((ctx) => {
   *     if (ctx.error instanceof Error) {
   *       return ctx.stop(ctx.error.message);
   *     }
   *     return ctx.retry();
   * });
   *
   * const result = await retry.run((ctx) => {
   *   if (ctx.attempt % 2 === 0) {
   *     throw new Error("Invalid attempt value!");
   *   }
   *   return ctx.retry();
   * });
   *
   * expect(result).toMatchObject({
   *   ok: false,
   *   error: "Invalid attempt value!"
   * });
   */
  onError<Fn extends OnErrorAsyncFn<any>>(fn: Fn): RetryAsync<OnErrorFnReturnType<Fn>, F> {
    const config = this.config();
    const clone = new RetryAsync<OnErrorFnReturnType<Fn>, F>(config);
    clone.cfg.onError = fn;
    clone.cfg.fallback = this.cfg.fallback;
    return clone;
  }

  /**
   * Method to configure a fallback value.
   * @returns {RetryAsync<E, E>} Returns a clone of the {@link RetryAsync} with fallback configured.
   * @example
   * const retry = new RetryAsync({ attempts: 5, delayms: 200 })
   *   .fallback("Attempts exhausted");
   * const result = await retry.run((ctx) => ctx.retry());
   *
   * expect(result).toMatchObject({
   *   ok: false,
   *   error: "Attempts exhausted"
   * });
   */
  fallback(fallback: E): RetryAsync<E, E> {
    const config = this.config();
    const clone = new RetryAsync<E, E>(config);
    clone.cfg.onError = this.cfg.onError!;
    clone.cfg.fallback = fallback;
    return clone;
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
  async run<Fn extends BaseRunAsyncFn>(fn: Fn): Promise<RunResult<RunFnReturnType<Fn>, E | F>> {
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
        if (this.cfg.onError) {
          const ctx = new OnErrorContext(i, e as E);
          const result = await this.cfg.onError(ctx);
          if (!result.ok) {
            return result;
          }
        }
      }
    }

    return new RunError(this.cfg.fallback);
  }

  private config(): RetryAsyncConfig {
    const config: RetryAsyncConfig = { attempts: this.attempts };
    if (this.delayms) config.delayms = this.delayms;
    return config;
  }
}
