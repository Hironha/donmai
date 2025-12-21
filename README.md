## Donmai

Donmai is a library that expects your code to fail, but stands by your side and helps you retry until success. Inspired by [retry](https://github.com/tim-kos/node-retry), it has a fluent, minimal and intuitive API to configure your attempts and handle unexpected errors.

This library is meant to be small, so it has no third party dependencies. Also, all the code is only one file to help copy/paste into projects.

```ts
const retry = new Retry({ attempts: 5 }).onError((ctx) => {
  if (ctx.error instanceof Error) {
    console.error("Something unexpected happened: ", ctx.error);
    return ctx.retry();
  }
  return ctx.stop();
});

const result = retry.run((ctx) => {
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
