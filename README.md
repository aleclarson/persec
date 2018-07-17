# persec v1.0.0

> ```
> npm install persec
> ```

Tiny, modern benchmarking library

- simple API
- asynchronous support
- test matrix support
- modern codebase
- well documented
- no dependencies
- small footprint

## Terminology

- **sample:** a single measurement of some test function.
- **cycle:** a group of samples for some test function.
- **suite:** a group of cycles that compete with each other.
- **case:** an arbitrary value that defines the behavior of a suite.
- **factory:** a function that produces a suite of test functions.

## Usage

Every `psec()` call in a single tick of the event loop is batched
into the same test suite. This suite is measured in the *next* tick
of the event loop, one test function at any given time.

```js
const psec = require('persec');

psec.configure({
  delay: 0.005,
  minTime: 1,
  minSamples: 5,
  onSample(ms, cycle) {},
  onCycle(cycle) {},
  onError(e) {},
  onFinish() {},
});

const fs = require('fs');
const file = './foo.txt';

psec('fs.readFileSync', () => {
  fs.readFileSync(file);
});

psec('fs.readFile', (done) => {
  fs.readFile(file, done);
});

// node v10+
if (10 <= parseFloat(process.versions.node)) {
  psec('fs.promises.readFile', async (done) => {
    await fs.promises.readFile(file);
    done();
  });
}
```

Try the above example:
```sh
git clone https://github.com/aleclarson/parsec
./parsec/example.js
```

&nbsp;

### `psec.each()`

Use `psec.each()` if you have multiple test cases.

```js
// Each test case is an arbitrary value that is passed
// to the test factory, which defines the test functions.
const cases = [a, b, c];
psec.each(cases, function(value) {
  // You usually want a header for each test case.
  console.log('\nvalue =', value);

  // Define your test functions in here!
  psec('foo', () => {});
  psec('bar', () => {});
});
```

Test cases are measured in order, one at a time.

The `each` method is what provides support for test matrices, which you can
think of as a tabular data set where the rows are test **cases** and the
columns are test **cycles**.

The `each` method is even more flexible than a simple matrix, because the test
factory can inspect each test case to determine which test functions to create.

&nbsp;

### `psec.then()`

Use `psec.then()` if you want to know when the next suite finishes.

```js
psec.then(cycles => {
  console.log(cycles);
});
```

The `cycles` object maps test names to their cycle objects.

Each `cycle` object contains:
- `name: string` the test name
- `hz: number` the number of calls per second
- `size: number` the number of samples used
- `time: number` measurement time (*not* the combined sample time)
- `stats: Object`

The `stats` object contains:
- `deviation: number` the standard deviation
- `mean: number` the average sample time
- `moe: number` the margin of error
- `rme: number` the *relative* margin of error
- `sem: number` the standard error of the mean
- `variance: number` the sample variance

&nbsp;

## Configuration

- `delay: number` delay (in seconds) between samples - default: `0.005`
- `minTime: number` minimum seconds per cycle - default: `1`
- `minSamples: number` minimum number of samples - default: `5`
- `onSample: function` called at the end of every sample
- `onCycle: function` called at the end of every cycle
- `onError: function` called when an error is caught
- `onFinish: function` called when a suite finishes

Increase the accuracy of your benchmark by setting `minTime` or `minSamples`
higher. The "right" value of each option depends on what your code does and
how patient you are.

The `onCycle` option defaults to logging the average number of calls per second.

The `onError` option defaults to `console.error`.

The default options are defined in the `psec.defaults` object.
