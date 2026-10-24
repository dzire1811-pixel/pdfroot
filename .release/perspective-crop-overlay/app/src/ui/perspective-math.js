(function (root) {
  "use strict";
  // Clockwise screen coordinates: top-left, top-right, bottom-right, bottom-left.
  function validQuad(points) {
    if (!Array.isArray(points) || points.length !== 4 || points.some(p => !p ||
      !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return false;
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
      if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < 0.00001) return false;
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.005) return false;
      area += a.x * b.y - a.y * b.x;
    }
    return area / 2 >= 0.0001;
  }
  function homography(points) {
    const [a, b, c, d] = points;
    const dx1 = b.x - c.x, dx2 = d.x - c.x, dx3 = a.x - b.x + c.x - d.x;
    const dy1 = b.y - c.y, dy2 = d.y - c.y, dy3 = a.y - b.y + c.y - d.y;
    const determinant = dx1 * dy2 - dx2 * dy1;
    let g = 0, h = 0;
    if (Math.abs(dx3) + Math.abs(dy3) > 1e-12) {
      if (Math.abs(determinant) < 1e-12) throw new Error("Move the four corners apart.");
      g = (dx3 * dy2 - dx2 * dy3) / determinant;
      h = (dx1 * dy3 - dx3 * dy1) / determinant;
    }
    return [b.x - a.x + g * b.x, d.x - a.x + h * d.x, a.x,
      b.y - a.y + g * b.y, d.y - a.y + h * d.y, a.y, g, h];
  }
  function mapPoint(matrix, u, v) {
    const denominator = matrix[6] * u + matrix[7] * v + 1;
    return { x: (matrix[0] * u + matrix[1] * v + matrix[2]) / denominator,
      y: (matrix[3] * u + matrix[4] * v + matrix[5]) / denominator };
  }
  function outputSize(points, width, height) {
    if (!validQuad(points)) throw new Error("Set four corners around the photo without crossing the edges.");
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 ||
      width > 16000 || height > 16000 || width * height > 50_000_000) throw new Error("Image dimensions are too large or too small for Perspective Crop.");
    const pixels = points.map(p => ({ x: p.x * (width - 1), y: p.y * (height - 1) }));
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const w = Math.max(2, Math.round(Math.max(distance(pixels[0], pixels[1]), distance(pixels[3], pixels[2]))) + 1);
    const h = Math.max(2, Math.round(Math.max(distance(pixels[0], pixels[3]), distance(pixels[1], pixels[2]))) + 1);
    if (w > 16000 || h > 16000 || w * h > 50_000_000) throw new Error("Perspective Crop output exceeds 50 megapixels. Move the corners closer together.");
    return { width: w, height: h };
  }
  function warp(data, width, height, points) {
    const size = outputSize(points, width, height);
    if (!data || data.length !== width * height * 4) throw new Error("Invalid image pixels.");
    const matrix = homography(points);
    const result = new Uint8ClampedArray(size.width * size.height * 4);
    for (let y = 0; y < size.height; y++) {
      const v = y / (size.height - 1);
      for (let x = 0; x < size.width; x++) {
        const u = x / (size.width - 1), denominator = matrix[6] * u + matrix[7] * v + 1;
        const sx = Math.max(0, Math.min(width - 1, (matrix[0] * u + matrix[1] * v + matrix[2]) / denominator * (width - 1)));
        const sy = Math.max(0, Math.min(height - 1, (matrix[3] * u + matrix[4] * v + matrix[5]) / denominator * (height - 1)));
        const left = Math.floor(sx), top = Math.floor(sy), right = Math.min(width - 1, left + 1), bottom = Math.min(height - 1, top + 1);
        const fx = sx - left, fy = sy - top;
        const i0 = (top * width + left) * 4, i1 = (top * width + right) * 4;
        const i2 = (bottom * width + left) * 4, i3 = (bottom * width + right) * 4;
        const w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy;
        const a0 = data[i0 + 3] * w0, a1 = data[i1 + 3] * w1, a2 = data[i2 + 3] * w2, a3 = data[i3 + 3] * w3;
        const alpha = a0 + a1 + a2 + a3, out = (y * size.width + x) * 4;
        if (alpha > 0) for (let channel = 0; channel < 3; channel++) {
          result[out + channel] = (data[i0 + channel] * a0 + data[i1 + channel] * a1 + data[i2 + channel] * a2 + data[i3 + channel] * a3) / alpha;
        }
        result[out + 3] = alpha;
      }
    }
    return { ...size, data: result };
  }
  const api = { validQuad, homography, mapPoint, outputSize, warp };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PerspectiveMath = api;
})(typeof self === "object" ? self : globalThis);
