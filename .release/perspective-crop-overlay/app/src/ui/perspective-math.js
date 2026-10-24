(function (root) {
  "use strict";
  // Clockwise screen coordinates: top-left, top-right, bottom-right, bottom-left.
  function validQuad(points) {
    if (!Array.isArray(points) || points.length !== 4 || points.some(p => !p ||
      !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < -2 || p.x > 3 || p.y < -2 || p.y > 3)) return false;
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
      b.y - a.y + g * b.y, d.y - a.y + h * d.y, a.y, g, h, 1];
  }
  function mapPoint(matrix, u, v) {
    const denominator = matrix[6] * u + matrix[7] * v + (matrix[8] ?? 1);
    return { x: (matrix[0] * u + matrix[1] * v + matrix[2]) / denominator,
      y: (matrix[3] * u + matrix[4] * v + matrix[5]) / denominator };
  }
  function inverse(m) {
    const [a,b,c,d,e,f,g,h,i] = m;
    const det = a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
    if (Math.abs(det) < 1e-12) throw new Error("Move the corners farther apart.");
    return [(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det,
      (f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det,
      (d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det];
  }
  function transformSize(points, width, height, view) {
    if (!validQuad(points)) throw new Error("Keep the image corners apart without crossing the edges.");
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 ||
      width > 16000 || height > 16000 || width * height > 50_000_000) throw new Error("Image dimensions exceed the transform limits.");
    const bounds = view || {minX:Math.min(...points.map(p=>p.x)), minY:Math.min(...points.map(p=>p.y)),
      maxX:Math.max(...points.map(p=>p.x)), maxY:Math.max(...points.map(p=>p.y))};
    if (!Object.values(bounds).every(Number.isFinite)) throw new Error("Invalid transform bounds.");
    const left = Math.floor(bounds.minX * width + 1e-9), top = Math.floor(bounds.minY * height + 1e-9);
    const right = Math.ceil(bounds.maxX * width - 1e-9), bottom = Math.ceil(bounds.maxY * height - 1e-9);
    const w = right-left, h = bottom-top;
    if (w < 2 || h < 2 || w > 16000 || h > 16000 || w*h > 50_000_000) throw new Error("Transform output exceeds 16,000 px or 50 megapixels. Move the corners closer together.");
    return {width:w,height:h,left,top};
  }
  // Map the complete rectangular source INTO the user-positioned image corners.
  // Output samples use the inverse map, leaving the outside transparent.
  function transform(data, width, height, points, view) {
    const size = transformSize(points, width, height, view);
    if (!data || data.length !== width * height * 4) throw new Error("Invalid image pixels.");
    const matrix = inverse(homography(points));
    const result = new Uint8ClampedArray(size.width * size.height * 4);
    for (let y = 0; y < size.height; y++) {
      const v = (y + size.top + .5) / height;
      for (let x = 0; x < size.width; x++) {
        const u = (x + size.left + .5) / width;
        const denominator = matrix[6] * u + matrix[7] * v + matrix[8];
        if (Math.abs(denominator) < 1e-12) continue;
        const su = (matrix[0] * u + matrix[1] * v + matrix[2]) / denominator;
        const sv = (matrix[3] * u + matrix[4] * v + matrix[5]) / denominator;
        if (su < -1e-10 || su > 1+1e-10 || sv < -1e-10 || sv > 1+1e-10) continue;
        const sx = Math.max(0, Math.min(width-1, su*width-.5));
        const sy = Math.max(0, Math.min(height-1, sv*height-.5));
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
  const api = { validQuad, homography, inverse, mapPoint, transformSize, transform };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PerspectiveMath = api;
})(typeof self === "object" ? self : globalThis);
