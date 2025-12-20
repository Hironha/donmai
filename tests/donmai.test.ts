import { describe, expect, test } from "vitest";
import { Retry, RunOk, RunError } from "../src/index";

function getRandomNumber(min: number, max: number): number {
  return Math.round(Math.random() * (max - min)) + min;
}

describe("donmain", () => {
  test("allow to define custom error handling to a retry instance", async () => {
    const msg = "Cannot try more than seven times";
    const retry = new Retry({ attempts: 10 }).onError((ctx) => {
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

  test("allow manual control over retry", async () => {
    const retry = new Retry({ attempts: 10 });
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
});
