import process from "node:process";
import { describe, expect, test } from "vitest";
import { RetryAsync, RunOk, RunError, Retry } from "../src/index";

function getRandomNumber(min: number, max: number): number {
  return Math.round(Math.random() * (max - min)) + min;
}

describe("donmai", () => {
  describe("async", () => {
    test("allow manual control over retry", async () => {
      const retry = new RetryAsync({ attempts: 10 });
      const result = await retry.run((ctx) => {
        const rand = getRandomNumber(ctx.attempt, 10);
        if (rand < 7) {
          return ctx.retry();
        }
        return ctx.ok(rand);
      });

      expect(result.ok).toBeTruthy();
      expect(typeof RunOk.unwrap(result) === "number").toBeTruthy();
    });

    test("attempt counter works correctly", async () => {
      const retry = new RetryAsync({ attempts: 5 });

      const attempts: number[] = [];
      const result = await retry.run((ctx) => {
        attempts.push(ctx.attempt);
        return ctx.retry();
      });

      expect(result.ok).toBeFalsy();
      expect(attempts).toStrictEqual([1, 2, 3, 4, 5]);
    });

    test("fallback works", async () => {
      const retry = new RetryAsync({ attempts: 5 }).fallback("test");
      const result = await retry.run((ctx) => ctx.retry());

      expect(result.ok).toBeFalsy();
      expect(RunError.unwrap(result)).toStrictEqual("test");
    });

    test("allows defining custom error handling to a retry instance", async () => {
      const msg = "Cannot try more than seven times";
      const retry = new RetryAsync({ attempts: 10 }).onError((ctx) => {
        if (ctx.attempt < 7) {
          return ctx.retry();
        }
        return ctx.stop(msg);
      });

      const result = await retry.run((ctx) => {
        if (ctx.attempt > 7) {
          throw new Error(msg);
        }
        return ctx.retry();
      });

      expect(result.ok).toBeFalsy();
      expect(RunError.unwrap(result)).toStrictEqual(msg);
    });

    test("delay works", async () => {
      const attempts = 5;
      const delayMs = 200;
      const retry = new RetryAsync({ attempts, delayms: delayMs });

      const start = process.hrtime.bigint();
      const result = await retry.run((ctx) => ctx.retry());
      const end = process.hrtime.bigint();
      const elapsedMs = (end - start) / 1000n / 1000n;

      expect(result.ok).toBeFalsy();
      // last attempt should not delay on error since there is no more attempts left
      // and can return the error directly
      expect(elapsedMs).toBeGreaterThanOrEqual((attempts - 1) * delayMs);
      expect(elapsedMs).toBeLessThan(attempts * delayMs);
    });
  });

  describe("sync", () => {
    test("allow manual control over retry", async () => {
      const retry = new Retry({ attempts: 10 });
      const result = retry.run((ctx) => {
        const rand = getRandomNumber(ctx.attempt, 10);
        if (rand < 7) {
          return ctx.retry();
        }
        return ctx.ok(rand);
      });

      expect(result.ok).toBeTruthy();
      expect(typeof RunOk.unwrap(result) === "number").toBeTruthy();
    });

    test("attempt counter works correctly", async () => {
      const retry = new Retry({ attempts: 5 });

      const attempts: number[] = [];
      const result = retry.run((ctx) => {
        attempts.push(ctx.attempt);
        return ctx.retry();
      });

      expect(result.ok).toBeFalsy();
      expect(attempts).toStrictEqual([1, 2, 3, 4, 5]);
    });

    test("fallback works", async () => {
      const retry = new Retry({ attempts: 5 }).fallback("test");
      const result = retry.run((ctx) => ctx.retry());

      expect(result.ok).toBeFalsy();
      expect(RunError.unwrap(result)).toStrictEqual("test");
    });

    test("allows defining custom error handling to a retry instance", async () => {
      const msg = "Cannot try more than seven times";
      const retry = new Retry({ attempts: 10 }).onError((ctx) => {
        if (ctx.attempt < 7) {
          return ctx.retry();
        }
        return ctx.stop(msg);
      });

      const result = retry.run((ctx) => {
        if (ctx.attempt > 7) {
          throw new Error(msg);
        }
        return ctx.retry();
      });

      expect(result.ok).toBeFalsy();
      expect(RunError.unwrap(result)).toStrictEqual(msg);
    });
  });
});
