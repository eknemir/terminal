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

// ---- for models.js: geometries record their constructor args and transforms, materials their options ----
export class Quaternion {
  constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
  setFromUnitVectors(from, to) { this.from = from.clone(); this.to = to.clone(); return this; }
}
Object3D.prototype.lookAt = function (x, y, z) { this.lookingAt = new Vector3(x, y, z); };
Object.defineProperty(Object3D.prototype, 'quaternion', {
  get() { return this._q || (this._q = new Quaternion()); },
  configurable: true,
});
BufferGeometry.prototype.rotateX = function (a) { (this.rotations ||= []).push(['x', a]); return this; };
BufferGeometry.prototype.rotateZ = function (a) { (this.rotations ||= []).push(['z', a]); return this; };
BufferGeometry.prototype.toNonIndexed = function () { const g = Object.create(Object.getPrototypeOf(this)); Object.assign(g, this, { index: null, nonIndexed: true }); return g; };
// Boxes come indexed, cylinders not, so both paths of models.js's mergeGeometries prep run.
const shape = (type, indexed = true) => class extends BufferGeometry {
  constructor(...args) { super(); this.type = type; this.args = args; this.index = indexed ? { count: 1 } : null; }
};
export const CylinderGeometry = shape('Cylinder', false);
export const BoxGeometry = shape('Box');
export const OctahedronGeometry = shape('Octahedron');
export const TorusGeometry = shape('Torus');
export const SphereGeometry = shape('Sphere');
export class EdgesGeometry extends BufferGeometry {
  constructor(source, angle) { super(); this.source = source; this.angle = angle; }
}
export class MeshStandardMaterial extends Material {}
export class MeshPhysicalMaterial extends Material {}
export class MeshBasicMaterial extends Material {}
export class LineBasicMaterial extends Material {}
export class Scene extends Object3D {}
// three/addons/utils/BufferGeometryUtils.js
export function mergeGeometries(parts) { const g = new BufferGeometry(); g.merged = parts; return g; }
export function toCreasedNormals(g, angle) { g.creaseAngle = angle; return g; }

export class CanvasTexture {
  constructor(image) { this.image = image; this.needsUpdate = false; }
  dispose() { this.disposed = true; }
}
