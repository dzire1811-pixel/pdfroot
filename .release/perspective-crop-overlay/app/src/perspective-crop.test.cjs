const test = require('node:test');
const assert = require('node:assert/strict');
const { validQuad, homography, mapPoint, transformSize, transform } = require('./ui/perspective-math.js');
const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

test('Free Transform preserves every pixel of a full rectangular image', () => {
  const width = 19, height = 13;
  const pixels = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => i % 4 === 3 ? 255 : (i * 37) % 256);
  const result = transform(pixels, width, height, square);
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

test('Free Transform moves the complete image into the destination corners', () => {
  const width = 101, height = 81;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.set([x*2,y*3,10,255],(y*width+x)*4);
  const quad = [{x:.1,y:.1},{x:.9,y:.2},{x:.8,y:.9},{x:.2,y:.8}];
  const result = transform(pixels,width,height,quad);
  assert.equal(result.width,81);
  assert.equal(result.height,65);
  // Each source corner patch must move WITH its destination handle.
  const matrix = homography(quad);
  for (const [u,v] of [[.03,.03],[.97,.03],[.97,.97],[.03,.97]]) {
    const dest = mapPoint(matrix,u,v);
    const x = Math.floor(dest.x*width)-result.left, y = Math.floor(dest.y*height)-result.top;
    const i=(y*result.width+x)*4;
    assert.ok(Math.abs(result.data[i]-(u*width-.5)*2)<7);
    assert.ok(Math.abs(result.data[i+1]-(v*height-.5)*3)<7);
    assert.equal(result.data[i+3],255);
  }
  assert.equal(result.data[(result.width-1)*4+3],0,'area outside the transformed image must remain transparent');
});

test('outward and translated corner transforms preserve the entire source', () => {
  const pixels=Uint8ClampedArray.from({length:10*10*4},(_,i)=>i%4===3?255:i%256);
  const quad=[{x:-.2,y:.3},{x:.8,y:.3},{x:.8,y:1.3},{x:-.2,y:1.3}];
  assert.equal(validQuad(quad),true);
  const result=transform(pixels,10,10,quad);
  assert.equal(result.left,-2);assert.equal(result.top,3);
  assert.equal(result.width,10);assert.equal(result.height,10);
  assert.deepEqual(result.data,pixels);
});

test('crossed, collapsed, concave and non-finite corners are rejected', () => {
  for (const bad of [[], [square[0],square[2],square[1],square[3]],
    [square[0],square[0],square[2],square[3]],
    [square[0],square[1],{x:.1,y:.1},square[3]],
    [{x:NaN,y:0},...square.slice(1)]]) {
    assert.equal(validQuad(bad), false);
    assert.throws(() => transformSize(bad, 100, 100));
  }
  assert.throws(() => transformSize(square, 20000, 100));
  assert.throws(() => transformSize(square, 10000, 10000));
  assert.throws(() => transform(new Uint8Array(4), 100, 100, square));
});

test('bilinear sampling preserves alpha without dark fringes', () => {
  const pixels = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i++) pixels.set(i % 4 < 2 ? [255, 0, 0, 255] : [0,0,0,0], i*4);
  const result = transform(pixels, 4, 4, [{x:0,y:0},{x:.9,y:0},{x:.9,y:1},{x:0,y:1}]);
  let translucent = false;
  for (let i = 0; i < result.data.length; i += 4) if (result.data[i+3] > 0 && result.data[i+3] < 255) {
    translucent = true;
    assert.equal(result.data[i], 255);
    assert.equal(result.data[i+1], 0);
  }
  assert.equal(translucent, true);
});
