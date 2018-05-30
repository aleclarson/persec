#!/usr/bin/env node
const psec = require('./index.js');
const fs = require('fs');

const file = './foo.txt';
fs.writeFileSync(file, '');

const {inspect} = require('util');
console.log('defaults:', inspect(psec.defaults, {
  colors: true, compact: false
}) + '\n');

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

psec.then(() => {
  console.log('\nAll done!');
  fs.unlinkSync(file);
});
