## Donmai

Donmai is a library that expects your code to fail, but stands by your side and helps you retry until success. Inspired by [retry](https://github.com/tim-kos/node-retry), it has a fluent, minimal and intuitive API to configure your attempts and handle unexpected errors.

This library is meant to be small, so it has no third party dependencies. Also, all the code is only one file to help copy/paste into projects.

### Sync

The `Retry` is basically a wrapper over try/catch syntax with some utilities to easily allow controlling the workflow. If your closure is asynchronous, for example depends on a network request, prefer the `RetryAsync` variant.

```ts
const result = new Retry({ attempts: 5 }).run((ctx) => {
  if (ctx.attempt < 5) {
    return ctx.retry();
  }
  return ctx.ok(ctx.attempt);
});

expect(result).toMatchObject({
  ok: true,
  value: 5,
});
```

### Async

The `RetryAsync` is basically the sync variant with support for async closures. Also, since the most common use case for this variant is network IO, it allows configuring an automatic delay between each attempt and the `run` context provides a `delay` method to manually delay.

```ts
const result = await new RetryAsync({ attempts: 5, delayms: 200 }).run(async (ctx) => {
  if (ctx.attempt === 1) {
    // here is going to delay for (200 + 100)ms, which is the pre configured
    // delay plus the manual delay
    await ctx.delay(100);
    return ctx.retry();
  }

  if (ctx.attempt % 3 === 0) {
    throw new Error("An unexpected error");
  }

  if (ctx.attempt < 5) {
    return ctx.retry();
  }
  return ctx.ok(ctx.attempt);
});

expect(result).toMatchObject({
  ok: true,
  value: 5,
});
```
