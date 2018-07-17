let tests = [];      // tests for the next run
let config = null;   // config for the next runs
let promise = null;  // runner promise

function psec(name, test) {
  tests.push([name, test]);
  if (!promise) promise = new Promise(run);
}

module.exports = psec;

// run the given suite for each case (sequentially)
psec.each = async function(cases, suite) {
  let i = -1;
  while (++i < cases.length) {
    suite(cases[i]); // setup tests for this case
    await promise;   // wait for the runner to finish
  }
};

// run a function when the current run finishes
psec.then = function(done) {
  return promise.then(done);
};

// configure the next runs
psec.configure = function() {
  config = {
    ...psec.defaults,
    ...arguments[0],
  };
};

// default configuration
psec.defaults = {
  delay: 0.005,
  minTime: 1,
  minSamples: 5,
  onSample() {},
  onCycle,
  onError: console.error,
  onFinish() {},
};

function run(done) {
  process.nextTick(async () => {
    let _tests = tests.slice(0);
    let _config = config || psec.defaults;

    // let new tests be queued
    tests.length = 0;

    // find the longest test name
    _config.width = _tests.reduce(longest, 0);

    let i = -1, cycles = {};
    while (++i < _tests.length) {
      const [name, test] = _tests[i];
      try {
        cycles[name] = await measure(name, test, _config);
      } catch(e) {
        _config.onError(e);
      }
    }

    done(cycles); // all done!
    _config.onFinish(cycles);

    // start the next run
    if (tests.length) {
      promise = new Promise(run);
    } else {
      promise = null;
    }
  });
}

async function measure(name, test, opts) {
  let {delay, minTime, minSamples} = opts;

  delay *= 1e3;
  minTime *= 1e3;

  let samples = [];
  let cycle = {
    name,         // test name
    hz: null,     // samples per second
    size: null,   // number of samples
    time: null,   // elapsed time (including delays)
    stats: null,
  };

  let n = 0;
  let t = process.hrtime();

  // synchronous test
  if (test.length == 0) {
    let start;
    while (true) {
      start = process.hrtime();
      test();

      samples[n++] = clock(start);
      opts.onSample(samples[n - 1], cycle);

      if (minTime <= clock(t) && minSamples <= n) {
        break; // all done!
      }

      // wait then repeat
      await wait(delay);
    }
  }

  // asynchronous test
  else {
    let start;
    const next = function() {
      start = process.hrtime();
      test(done);
    };

    // called by the test function for every sample
    const done = function() {
      samples[n++] = clock(start);
      opts.onSample(samples[n - 1], cycle);

      if (minTime <= clock(t) && minSamples <= n) {
        return cycle.done(); // all done!
      }

      // wait then repeat
      wait(delay).then(next);
    };

    defer(cycle); // wrap cycle with a promise
    next();       // get the first sample

    // wait for samples
    await cycle.promise;
  }

  const time = clock(t);
  const stats = analyze(samples);
  cycle.hz = 1000 / stats.mean;
  cycle.size = n;
  cycle.time = time;
  cycle.stats = stats;

  opts.onCycle(cycle, opts);
}

function clock(start) {
  let [secs, nano] = process.hrtime(start);
  return secs * 1e3 + nano * 1e-6;
}

function wait(ms) {
  if (ms <= 0) return;
  return new Promise(done => {
    setTimeout(done, ms);
  });
}

function defer(cycle) {
  cycle.promise = new Promise(done => {
    cycle.done = done;
  });
}

// Stolen from https://github.com/bestiejs/benchmark.js
const analyze = (function() {
  // T-Distribution two-tailed critical values for 95% confidence
  // http://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm
  const tTable = {
    '1':  12.706, '2':  4.303, '3':  3.182, '4':  2.776, '5':  2.571, '6':  2.447,
    '7':  2.365,  '8':  2.306, '9':  2.262, '10': 2.228, '11': 2.201, '12': 2.179,
    '13': 2.16,   '14': 2.145, '15': 2.131, '16': 2.12,  '17': 2.11,  '18': 2.101,
    '19': 2.093,  '20': 2.086, '21': 2.08,  '22': 2.074, '23': 2.069, '24': 2.064,
    '25': 2.06,   '26': 2.056, '27': 2.052, '28': 2.048, '29': 2.045, '30': 2.042,
    'infinity': 1.96
  };

  function computeMean(samples) {
    let i = -1, sum = 0, len = samples.length;
    while (++i < len) sum += samples[i];
    return sum / len;
  }

  function computeVariance(samples, mean) {
    let i = -1, sum = 0, len = samples.length;
    while (++i < len) sum += Math.pow(samples[i] - mean, 2);
    return sum / (len - 1) || 0;
  }

  return function(samples) {
    // Compute the sample mean (estimate of the population mean).
    const mean = computeMean(samples);
    // Compute the sample variance (estimate of the population variance).
    const variance = computeVariance(samples, mean);
    // Compute the sample standard deviation (estimate of the population standard deviation).
    const sd = Math.sqrt(variance);
    // Compute the standard error of the mean (a.k.a. the standard deviation of the sampling distribution of the sample mean).
    const sem = sd / Math.sqrt(samples.length);
    // Compute the degrees of freedom.
    const df = samples.length - 1;
    // Compute the critical value.
    const critical = tTable[Math.round(df) || 1] || tTable.infinity;
    // Compute the margin of error.
    const moe = sem * critical;
    // Compute the relative margin of error.
    const rme = (moe / mean) * 100 || 0;
    // Return a stats object.
    return {
      deviation: sd,
      mean,
      moe,
      rme,
      sem,
      variance,
    };
  };
})();

// Longest name reducer
function longest(len, test) {
  return Math.max(len, test[0].length);
}

// default cycle reporter
function onCycle(cycle, opts) {
  let hz = Math.round(cycle.hz).toLocaleString();
  let rme = '\xb1' + cycle.stats.rme.toFixed(2) + '%';

  // add colors
  hz = rgb(0, 1, 5) + hz + '\x1b[0m';
  rme = rgb(5, 5, 2) + rme + '\x1b[0m';

  const padding = ' '.repeat(opts.width - cycle.name.length);
  console.log(`${cycle.name}${padding}  ${hz} ops/sec  ${rme}`);
}

// ansi 256 colors
function rgb(r, g, b) {
  const i = 16 + (36 * r) + (6 * g) + b;
  return `\x1b[38;5;${i}m`;
}
