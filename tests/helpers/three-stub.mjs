// A tiny stand-in for 'three', just enough for app/orbit's modules to load and run their logic in Node
// (no WebGL). Loaded in place of the real package by tests/helpers/orbit.js.
export const AdditiveBlending = 2;
export const DoubleSide = 2;
export const DynamicDrawUsage = 35048;
export const SRGBColorSpace = 'srgb';

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s) { return this.set(s, s, s); }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
}
export class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } }

export class Color {
  constructor(r, g, b) {
    this.r = 1; this.g = 1; this.b = 1;
    if (g !== undefined) { this.r = r; this.g = g; this.b = b; }
    else if (typeof r === 'number') this.setHex(r);
    else if (typeof r === 'string') this.setHex(parseInt(r.replace('#', ''), 16));
  }
  setHex(h) { this.r = ((h >> 16) & 255) / 255; this.g = ((h >> 8) & 255) / 255; this.b = (h & 255) / 255; return this; }
  setHSL(h, s, l) { this.h = h; this.s = s; this.l = l; this.r = l; this.g = l; this.b = l; return this; }
  multiplyScalar(k) { this.r *= k; this.g *= k; this.b *= k; return this; }
  clone() { return new Color(this.r, this.g, this.b); }
}

export class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.updateRanges = []; this.needsUpdate = false; }
  setUsage(u) { this.usage = u; return this; }
  clearUpdateRanges() { this.updateRanges = []; }
  addUpdateRange(start, count) { this.updateRanges.push({ start, count }); }
}
export class Float32BufferAttribute extends BufferAttribute {
  constructor(arr, itemSize) { super(new Float32Array(arr), itemSize); }
}
export class BufferGeometry {
  constructor() { this.attributes = {}; this.drawRange = { start: 0, count: Infinity }; }
  setAttribute(k, a) { this.attributes[k] = a; return this; }
  setDrawRange(start, count) { this.drawRange = { start, count }; }
}
export class PlaneGeometry extends BufferGeometry {
  constructor(w, h) { super(); this.parameters = { width: w, height: h }; }
}

export class Material {
  constructor(opts = {}) { Object.assign(this, { opacity: 1, rotation: 0 }, opts); }
  dispose() { this.disposed = true; }
}
export class ShaderMaterial extends Material {}
export class SpriteMaterial extends Material {}

export class Object3D {
  constructor() {
    this.children = [];
    this.position = new Vector3();
    this.scale = new Vector3(1, 1, 1);
    this.rotation = new Vector3();
  }
  add(...o) { this.children.push(...o); return this; }
}
export class Group extends Object3D {}
export class Points extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } }
export class LineSegments extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } }
export class Sprite extends Object3D { constructor(m) { super(); this.material = m; } }
export class Mesh extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } }

export class CanvasTexture {
  constructor(image) { this.image = image; this.needsUpdate = false; }
  dispose() { this.disposed = true; }
}
