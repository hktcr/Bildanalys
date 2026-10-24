'use strict';
// Independent reviewer checks. Pass the reviewed core.js path as the first argument.
const assert = require('node:assert/strict');
const path = require('node:path');
const C = require(path.resolve(process.argv[2] || path.join(__dirname,'../../docs/sharpframe/core.js')));
function image(w, h, fn) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const value = fn(x, y), p = (y * w + x) * 4;
        if (Array.isArray(value)) { data[p] = value[0]; data[p + 1] = value[1]; data[p + 2] = value[2]; }
        else data[p] = data[p + 1] = data[p + 2] = value;
        data[p + 3] = 255;
    }
    return { width: w, height: h, data };
}
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS independent: ' + name); }
const source = image(83, 57, (x, y) => 80 + 90 * (x > 20 && x < 55 && y > 15 && y < 40));
check('Metrics and signatures do not mutate source RGBA', () => {
    const before = Buffer.from(source.data); C.metrics(source); C.signature(source);
    assert.equal(Buffer.compare(before, Buffer.from(source.data)), 0);
});
check('Smoothed Sobel is invariant to transpose on a non-square image', () => {
    const other = image(source.height, source.width, (x, y) => source.data[(x * source.width + y) * 4]);
    assert(Math.abs(C.metrics(source).detailRaw - C.metrics(other).detailRaw) < 1e-9);
});
check('Additive brightness shift below clipping preserves detail', () => {
    const other = image(83, 57, (x, y) => source.data[(y * 83 + x) * 4] + 30);
    assert(Math.abs(C.metrics(source).detailRaw - C.metrics(other).detailRaw) < 1e-9);
});
check('Contrast dependence is squared, not a quality-invariant score', () => {
    const a = image(83, 57, (x, y) => 40 + 40 * (x > 20 && x < 55 && y > 15 && y < 40));
    const b = image(83, 57, (x, y) => 40 + 80 * (x > 20 && x < 55 && y > 15 && y < 40));
    assert(Math.abs(C.metrics(b).detailRaw / C.metrics(a).detailRaw - 4) < 1e-9);
});
check('Tiny image signatures are finite and repeat identically', () => {
    for (let w = 1; w <= 34; w++) for (let h = 1; h <= 34; h++) {
        const a = image(w, h, (x, y) => (31 * x + 47 * y) % 256), sig = C.signature(a);
        assert([...sig.rgb].every(Number.isFinite)); assert(C.similar(sig, C.signature(a)));
    }
});
check('Visual filtering retains the highest-scored exact duplicate', () => {
    const signature = C.signature(source);
    const rows = [{ time: 0, detailRaw: 10, signature }, { time: 3, detailRaw: 20, signature }];
    assert.equal(C.select(rows, { count: 2, gap: 0, dedupe: true }).selected[0].time, 3);
});
check('Spacing includes the intended equality boundary', () => {
    const rows = [{ time: .1, detailRaw: 2 }, { time: .3, detailRaw: 1 }];
    assert.equal(C.select(rows, { count: 2, gap: .2 }).selected.length, 2);
});
check('Refinement remains bounded for nonzero, tiny and long windows', () => {
    for (const [start, end, interval] of [[10, 10.003, .1], [10, 10.13, .1], [12, 12.5, .5], [105, 9905, 5]]) {
        const times = C.samplingTimes(start, end, interval);
        const rows = times.map((time, i) => ({ time, detailRaw: i }));
        const step = times.length > 1 ? times[1] - times[0] : Math.min(interval, end - start);
        const refined = C.refinementTimes(rows, start, end, step, 'detail', times);
        assert(refined.length <= 80); assert(refined.every(t => t >= start && t < end));
        assert.equal(new Set(refined.map(t => Math.round(t * 1e6))).size, refined.length);
        const coarse = new Set(times.map(t => Math.round(t * 1e6)));
        assert(refined.every(t => !coarse.has(Math.round(t * 1e6))));
    }
});
console.log(`${passed}/${passed} independent checks passed`);
