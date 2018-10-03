const defaults = {
  delay: 0.005,
  minTime: 1,
  minSamples: 5,
  onSample() {},
  onCycle,
  onError: console.error,
  onFinish() {},
}

class Benchmark {
  constructor() {
    this.tests = []
    this.promise = new Promise(done => {
      this.done = done
    })
    this.config = Object.create(defaults)
    this.before = []
    this.after = []
  }
  run() {
    this.run = () => {}
    if (queue.push(this) == 1) {
      flush()
    }
  }
}

/** The benchmark context */
let ctx = new Benchmark()

/** The queue of benchmarks ready to run. The active benchmark is first. */
let queue = []

/** Register a test case */
function psec(name, test) {
  ctx.tests.push({
    name,
    test,
  })
  ctx.run()
}

module.exports = psec

/** Run the given function **before** each sample */
psec.beforeEach = function(fn) {
  ctx.before.push(fn)
}

/** Run the given function **after** each sample */
psec.afterEach = function(fn) {
  ctx.after.push(fn)
}

// For each case in the `cases` array, run a new benchmark using the `setup` function.
// The `cases` array may contain any value useful for configuring a benchmark.
// Think of your `setup` function as a benchmark factory.
psec.each = async function(cases, setup) {
  let parent = ctx
  for (let i = 0; i < cases.length; i++) {
    ctx = new Benchmark()
    setup(cases[i])
  }
  ctx = parent
}

/** Run a function when the benchmark finishes */
psec.then = function(done, onError) {
  return ctx.promise.then(done, onError)
}

/** Configure the benchmark context */
psec.configure = function(config) {
  Object.assign(ctx.config, config)
}

/** The default configuration */
psec.defaults = defaults

/**
 * Internal
 */

/** Flush the benchmark queue */
function flush() {
  if (queue.length) {
    let bench = queue[0]
    process.nextTick(() => {
      run(bench).then(() => {
        queue.shift()
        flush()
      }, console.error)
    })
  }
}

/** Run a benchmark */
async function run(bench) {
  let { tests, config } = bench

  // Find the longest test name.
  config.width = tests.reduce(longest, 0)

  let cycles = {}
  for (let i = 0; i < tests.length; i++) {
    let { name, test } = tests[i]
    try {
      cycles[name] = await measure(name, test, bench)
    } catch (e) {
      config.onError(e)
    }
  }

  // all done!
  config.onFinish(cycles)
  bench.done(cycles)
}

/** Measure a performance test */
async function measure(name, test, bench) {
  let { delay, minTime, minSamples, onCycle, onSample } = bench.config

  delay *= 1e3
  minTime *= 1e3

  let samples = []
  let cycle = {
    name, // test name
    hz: null, // samples per second
    size: null, // number of samples
    time: null, // elapsed time (including delays)
    stats: null,
  }

  let n = 0
  let t = process.hrtime()

  // synchronous test
  if (test.length == 0) {
    let start
    while (true) {
      bench.before.forEach(call)
      start = process.hrtime()
      test()

      samples[n++] = clock(start)
      onSample(samples[n - 1], cycle)
      bench.after.forEach(call)

      if (minTime <= clock(t) && minSamples <= n) {
        break // all done!
      }

      // wait then repeat
      await wait(delay)
    }
  }

  // asynchronous test
  else {
    let start
    const next = function() {
      bench.before.forEach(call)
      start = process.hrtime()
      test(done)
    }

    // called by the test function for every sample
    const done = function() {
      samples[n++] = clock(start)
      onSample(samples[n - 1], cycle)
      bench.after.forEach(call)

      if (minTime <= clock(t) && minSamples <= n) {
        return cycle.done() // all done!
      }

      // wait then repeat
      wait(delay).then(next)
    }

    defer(cycle) // wrap cycle with a promise
    next() // get the first sample

    // wait for samples
    await cycle.promise
  }

  const time = clock(t)
  const stats = analyze(samples)
  cycle.hz = 1000 / stats.mean
  cycle.size = n
  cycle.time = time
  cycle.stats = stats

  onCycle(cycle, bench.config)
}

function call(fn) {
  return fn()
}

function clock(start) {
  let [secs, nano] = process.hrtime(start)
  return secs * 1e3 + nano * 1e-6
}

function wait(ms) {
  if (ms <= 0) return
  return new Promise(done => {
    setTimeout(done, ms)
  })
}

function defer(cycle) {
  cycle.promise = new Promise(done => {
    cycle.done = done
  })
}

// Stolen from https://github.com/bestiejs/benchmark.js
const analyze = (function() {
  // T-Distribution two-tailed critical values for 95% confidence
  // http://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm
  const tTable = {
    '1': 12.706,
    '2': 4.303,
    '3': 3.182,
    '4': 2.776,
    '5': 2.571,
    '6': 2.447,
    '7': 2.365,
    '8': 2.306,
    '9': 2.262,
    '10': 2.228,
    '11': 2.201,
    '12': 2.179,
    '13': 2.16,
    '14': 2.145,
    '15': 2.131,
    '16': 2.12,
    '17': 2.11,
    '18': 2.101,
    '19': 2.093,
    '20': 2.086,
    '21': 2.08,
    '22': 2.074,
    '23': 2.069,
    '24': 2.064,
    '25': 2.06,
    '26': 2.056,
    '27': 2.052,
    '28': 2.048,
    '29': 2.045,
    '30': 2.042,
    infinity: 1.96,
  }

  function computeMean(samples) {
    let i = -1,
      sum = 0,
      len = samples.length
    while (++i < len) sum += samples[i]
    return sum / len
  }

  function computeVariance(samples, mean) {
    let i = -1,
      sum = 0,
      len = samples.length
    while (++i < len) sum += Math.pow(samples[i] - mean, 2)
    return sum / (len - 1) || 0
  }

  return function(samples) {
    // Compute the sample mean (estimate of the population mean).
    const mean = computeMean(samples)
    // Compute the sample variance (estimate of the population variance).
    const variance = computeVariance(samples, mean)
    // Compute the sample standard deviation (estimate of the population standard deviation).
    const sd = Math.sqrt(variance)
    // Compute the standard error of the mean (a.k.a. the standard deviation of the sampling distribution of the sample mean).
    const sem = sd / Math.sqrt(samples.length)
    // Compute the degrees of freedom.
    const df = samples.length - 1
    // Compute the critical value.
    const critical = tTable[Math.round(df) || 1] || tTable.infinity
    // Compute the margin of error.
    const moe = sem * critical
    // Compute the relative margin of error.
    const rme = (moe / mean) * 100 || 0
    // Return a stats object.
    return {
      deviation: sd,
      mean,
      moe,
      rme,
      sem,
      variance,
    }
  }
})()

// Longest name reducer
function longest(len, test) {
  return Math.max(len, test.name.length)
}

// default cycle reporter
function onCycle(cycle, opts) {
  let hz = Math.round(cycle.hz).toLocaleString()
  let rme = '\xb1' + cycle.stats.rme.toFixed(2) + '%'

  // add colors
  hz = color(34) + hz + color(0)
  rme = color(33) + rme + color(0)

  const padding = ' '.repeat(opts.width - cycle.name.length)
  console.log(`${cycle.name}${padding}  ${hz} ops/sec  ${rme}`)
}

// ansi 8 colors
function color(i) {
  return `\x1b[${i}m`
}
