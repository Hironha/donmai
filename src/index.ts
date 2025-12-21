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

export class RunContext {
  public readonly attempt: number;

  constructor(attempt: number) {
    this.attempt = attempt;
  }

  retry(): RunError<void> {
    return RunError.empty();
  }

  ok(): RunOk<void>;
  ok<T>(value: T): RunOk<T>;
  ok<T>(value?: T): RunOk<T | void> {
    return new RunOk(value);
  }
}

export class OnErrorContext {
  /** Number of the current attempt. */
  public readonly attempt: number;
  public readonly error: unknown;

  constructor(attempt: number, error: unknown) {
    this.attempt = attempt;
    this.error = error;
  }

  retry(): RunOk<void> {
    return RunOk.empty();
  }

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
  ctx: RunContext,
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
  attempts: number;
  delayms?: number;
}

export interface RetryConfig {
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

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export class Retry<E = unknown, F = undefined> {
  public readonly attempts: number;

  private cfg: RetryPrivateConfig<E, F>;

  constructor(config: RetryConfig) {
    this.cfg = { fallback: undefined as F };
    this.attempts = config.attempts ?? DEFAULT_ATTEMPTS;
    if (this.attempts <= 0) {
      this.attempts = DEFAULT_ATTEMPTS;
    } else if (!Number.isInteger(this.attempts)) {
      this.attempts = Math.floor(this.attempts) || DEFAULT_ATTEMPTS;
    }
  }

  onError<Fn extends OnErrorFn<any>>(fn: Fn): Retry<OnErrorFnReturnType<Fn>, F> {
    const config = this.config();
    const clone = new Retry<OnErrorFnReturnType<Fn>, F>(config);
    clone.cfg.onError = fn;
    clone.cfg.fallback = this.cfg.fallback;
    return clone;
  }

  fallback(fallback: E): Retry<E, E> {
    const config = this.config();
    const clone = new Retry<E, E>(config);
    clone.cfg.onError = this.cfg.onError!;
    clone.cfg.fallback = fallback;
    return clone;
  }

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

export class RetryAsync<E = unknown, F = undefined> {
  public readonly attempts: number;
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

  onError<Fn extends OnErrorAsyncFn<any>>(fn: Fn): RetryAsync<OnErrorFnReturnType<Fn>, F> {
    const config = this.config();
    const clone = new RetryAsync<OnErrorFnReturnType<Fn>, F>(config);
    clone.cfg.onError = fn;
    clone.cfg.fallback = this.cfg.fallback;
    return clone;
  }

  fallback(fallback: E): RetryAsync<E, E> {
    const config = this.config();
    const clone = new RetryAsync<E, E>(config);
    clone.cfg.onError = this.cfg.onError!;
    clone.cfg.fallback = fallback;
    return clone;
  }

  async run<Fn extends BaseRunAsyncFn>(fn: Fn): Promise<RunResult<RunFnReturnType<Fn>, E | F>> {
    for (let i = 0; i < this.attempts; i += 1) {
      try {
        const ctx = new RunContext(i + 1);
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
