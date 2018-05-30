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
}

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
      let [name, test] = _tests[i];
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
    let next = function() {
      start = process.hrtime();
      test(done);
    };

    // called by the test function for every sample
    let done = function() {
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

  cycle.hz = 1000 / average(samples);
  cycle.size = n;
  cycle.time = clock(t);

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

function average(samples) {
  let i = -1, sum = 0, len = samples.length;
  while (++i < len) sum += samples[i];
  return sum / len;
}

// Longest name reducer
function longest(len, test) {
  return Math.max(len, test[0].length);
}

const reset = '\x1b[0m'; // ansi reset

// default cycle reporter
function onCycle(cycle, opts) {
  let padding = ' '.repeat(opts.width - cycle.name.length);
  let hz = rgb(0, 1, 5) + Math.round(cycle.hz).toLocaleString() + reset;
  console.log(`${cycle.name}${padding}  ${hz} ops/sec`);
}

// ansi 256 colors
function rgb(r, g, b) {
  let i = 16 + (36 * r) + (6 * g) + b;
  return `\x1b[38;5;${i}m`;
}
