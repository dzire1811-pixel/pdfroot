const test = require('node:test');
const assert = require('node:assert/strict');
const { validQuad, homography, mapPoint, outputSize, warp } = require('./ui/perspective-math.js');
const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

test('Perspective Crop preserves every pixel of a full rectangular image', () => {
  const width = 19, height = 13;
  const pixels = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => i % 4 === 3 ? 255 : (i * 37) % 256);
  const result = warp(pixels, width, height, square);
  assert.equal(result.width, width);
  assert.equal(result.height, height);
  assert.deepEqual(result.data, pixels);
});

test('projective mapping hits all four corners and a known interior point', () => {
  // Independent analytic transform: x=(.1+.7u)/ (1+.2v), y=(.1+.8v)/(1+.2v).
  const quad = [{ x: .1, y: .1 }, { x: .8, y: .1 }, { x: 2/3, y: .75 }, { x: 1/12, y: .75 }];
  assert.equal(validQuad(quad), true);
  const matrix = homography(quad);
  for (const [index, uv] of [[0,[0,0]],[1,[1,0]],[2,[1,1]],[3,[0,1]]]) {
    const p = mapPoint(matrix, ...uv);
    assert.ok(Math.abs(p.x - quad[index].x) < 1e-12);
    assert.ok(Math.abs(p.y - quad[index].y) < 1e-12);
  }
  const center = mapPoint(matrix, .4, .6);
  assert.ok(Math.abs(center.x - (.1 + .7 * .4) / 1.12) < 1e-12);
  assert.ok(Math.abs(center.y - (.1 + .8 * .6) / 1.12) < 1e-12);
});

test('Perspective Crop resamples the selected corners at source resolution', () => {
  const width = 101, height = 81;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.set([x * 2, y * 3, 10, 255], (y * width + x) * 4);
  const quad = [{x:.1,y:.1},{x:.9,y:.2},{x:.8,y:.9},{x:.2,y:.8}];
  const result = warp(pixels, width, height, quad);
  const corners = [0, (result.width - 1)*4, (result.width*result.height - 1)*4, result.width*(result.height - 1)*4];
  for (let i = 0; i < 4; i++) {
    assert.equal(result.data[corners[i]], Math.round(quad[i].x * 200));
    assert.equal(result.data[corners[i]+1], Math.round(quad[i].y * 240));
    assert.equal(result.data[corners[i]+3], 255);
  }
});

test('crossed, collapsed, concave, off-image and non-finite corners are rejected', () => {
  for (const bad of [[], [square[0],square[2],square[1],square[3]],
    [square[0],square[0],square[2],square[3]],
    [square[0],square[1],{x:.1,y:.1},square[3]],
    [{x:-.1,y:0},...square.slice(1)], [{x:NaN,y:0},...square.slice(1)]]) {
    assert.equal(validQuad(bad), false);
    assert.throws(() => outputSize(bad, 100, 100));
  }
  assert.throws(() => outputSize(square, 20000, 100));
  assert.throws(() => outputSize(square, 10000, 10000));
  assert.throws(() => warp(new Uint8Array(4), 100, 100, square));
});

test('bilinear sampling preserves alpha without dark fringes', () => {
  const pixels = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i++) pixels.set(i % 4 < 2 ? [255, 0, 0, 255] : [0,0,0,0], i*4);
  const result = warp(pixels, 4, 4, [{x:0,y:0},{x:.9,y:0},{x:.9,y:1},{x:0,y:1}]);
  let translucent = false;
  for (let i = 0; i < result.data.length; i += 4) if (result.data[i+3] > 0 && result.data[i+3] < 255) {
    translucent = true;
    assert.equal(result.data[i], 255);
    assert.equal(result.data[i+1], 0);
  }
  assert.equal(translucent, true);
});
