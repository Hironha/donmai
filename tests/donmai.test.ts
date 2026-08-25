import assert from "node:assert";
import process from "node:process";
import { describe, test } from "node:test";

import { Retry, RetryAsync, RunError, RunOk } from "../src/index.js";

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

      assert(result.ok, "result should be ok");
      assert(typeof RunOk.unwrap(result) === "number", "result value should be a number");
    });

    test("attempt counter works correctly", async () => {
      const retry = new RetryAsync({ attempts: 5 });

      const attempts: number[] = [];
      const result = await retry.run((ctx) => {
        attempts.push(ctx.attempt);
        return ctx.retry();
      });

      assert(!result.ok, "result should be error");
      assert.deepEqual(RunError.unwrap(result), { kind: "ehxausted", attempts: 5 });
      assert.deepEqual(attempts, [1, 2, 3, 4, 5], "array should contain all attempts");
    });

    test("delay works", async () => {
      const attempts = 5;
      const delayMs = 200;
      const retry = new RetryAsync({ attempts, delayms: delayMs });

      const start = process.hrtime.bigint();
      const result = await retry.run((ctx) => ctx.retry());
      const end = process.hrtime.bigint();
      const elapsedMs = (end - start) / BigInt(1e6);

      assert(!result.ok, "result should be error");
      assert.deepEqual(RunError.unwrap(result), { kind: "ehxausted", attempts: 5 });
      // last attempt should not delay on error since there is no more attempts left
      // and can return the error directly
      assert(elapsedMs >= (attempts - 1) * delayMs, "last attempt should not delay on error");
      assert(elapsedMs < attempts * delayMs, "total delay ~= (attempts - 1) * delay");
    });

    test("manual delay should add to pre configured delay", async () => {
      const retry = new RetryAsync({ attempts: 2, delayms: 100 });
      const start = process.hrtime.bigint();
      const result = await retry.run(async (ctx) => {
        if (ctx.attempt === 1) {
          await ctx.delay(200);
        }
        return ctx.retry();
      });
      const end = process.hrtime.bigint();
      const elapsedMs = (end - start) / BigInt(1e6);

      assert(!result.ok, "result should be an error");
      assert.deepEqual(RunError.unwrap(result), { kind: "ehxausted", attempts: 2 });
      assert(
        elapsedMs >= 200 + 100,
        "total delay should be pre configured delay plus manual delay",
      );
    });
  });

  describe("sync", () => {
    test("allow manual control over retry", () => {
      const retry = new Retry({ attempts: 10 });
      const result = retry.run((ctx) => {
        const rand = getRandomNumber(ctx.attempt, 10);
        if (rand < 7) {
          return ctx.retry();
        }
        return ctx.ok(rand);
      });

      assert(result.ok, "result should be ok");
      assert(typeof RunOk.unwrap(result) === "number", "result value should be a number");
    });

    test("attempt counter works correctly", () => {
      const retry = new Retry({ attempts: 5 });

      const attempts: number[] = [];
      const result = retry.run((ctx) => {
        attempts.push(ctx.attempt);
        return ctx.retry();
      });

      assert(!result.ok, "result should be error");
      assert.deepEqual(RunError.unwrap(result), { kind: "ehxausted", attempts: 5 });
      assert.deepEqual(attempts, [1, 2, 3, 4, 5], "array should contain all attempts");
    });

    test("example should work", async () => {
      const result = await new RetryAsync({ attempts: 5, delayms: 200 }).run(async (ctx) => {
        if (ctx.attempt === 1) {
          // here is going to delay for (200 + 100)ms, which is the pre configured
          // delay plus the manual delay
          await ctx.delay(100);
          return ctx.retry();
        }

        if (ctx.attempt < 5) {
          return ctx.retry();
        }
        return ctx.ok(ctx.attempt);
      });

      assert(result.ok, "result should be ok")
      assert.deepEqual(RunOk.unwrap(result), 5)
    })
  });
});
