// Walks the 3D viewer's camera along a planned walk-through (src/core/tour.js):
// eye height along each walk, a slow turn in each room, up the stairs. The
// viewer calls step() every frame through setDriver(); while paused the
// player lets go and the orbit controls look round from where it stopped.
// onChange({ move, index, room: { name, index, total, here }, paused, climbing, done }).

import { EYE_HEIGHT, WALK_SPEED, LOOK_TIME } from "../core/tour.js";

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));

export class TourPlayer {
  constructor(viewer, project, moves, { speed = 1, onChange = () => {} } = {}) {
    this.viewer = viewer;
    this.THREE = viewer.three.THREE;
    this.project = project;
    this.moves = moves;
    this.speed = speed;
    this.onChange = onChange;
    this.index = -1;
    this.paused = false;
    this.last = 0;
    this.yaw = null;
    this.wait = 0;
  }

  get camera() { return this.viewer.three.camera; }
  get target() { return this.viewer.three.controls.target; }
  V(x, y, z) { return new this.THREE.Vector3(x, y, z); }

  elevation(levelId) { return (this.project.levels.find((l) => l.id === levelId)?.elevation ?? 0) / 1000; }

  /** The camera place where a move begins. */
  startOf(m) {
    if (m.type === "look") return this.V(m.at[0], this.elevation(m.level) + EYE_HEIGHT, m.at[1]);
    if (m.type === "walk") return this.V(m.points[0][0], this.elevation(m.level) + EYE_HEIGHT, m.points[0][1]);
    return this.V(m.points[0][0], this.elevation(m.from) + m.points[0][1] + EYE_HEIGHT, m.points[0][2]);
  }

  /** A view along `yaw` from p (slightly down, as one looks walking). */
  ahead(p, yaw) { return p.clone().add(this.V(Math.sin(yaw) * 2, -0.12, Math.cos(yaw) * 2)); }

  glide(pos, target, ms) {
    this.viewer.flyTo(pos, target, ms);
    this.wait = performance.now() + ms + 50;
  }

  start() {
    this.saved = this.viewer.getCamera();
    this.viewer.setDriver((now, dt) => this.step(now, dt));
    // A glide from the current view to the first place on the route.
    const first = this.moves[0];
    const p0 = this.startOf(first);
    let yaw = 0;
    if (first.type === "walk" && first.points[1]) yaw = Math.atan2(first.points[1][0] - first.points[0][0], first.points[1][1] - first.points[0][1]);
    this.yaw = yaw;
    this.glide(p0, this.ahead(p0, yaw), 1100);
    this.go(0);
  }

  /** Builds the current move's motion. */
  go(i) {
    const THREE = this.THREE;
    this.index = i;
    const m = this.moves[i];
    this.t = 0;
    this.motion = null;
    if (!m) { this.finish(); return; }
    // A move that starts somewhere else (a room no walk reaches, another stair's floor): a glide there first.
    const at = this.startOf(m);
    if (!this.wait && at.distanceTo(this.camera.position) > 0.6) this.glide(at, this.ahead(at, this.currentYaw()), 900);
    if (m.type === "walk" || m.type === "climb") {
      const pts = m.type === "walk"
        ? m.points.map((p) => this.V(p[0], this.elevation(m.level) + EYE_HEIGHT, p[1]))
        : m.points.map((p) => this.V(p[0], this.elevation(m.from) + p[1] + EYE_HEIGHT, p[2]));
      const curve = pts.length > 2 ? new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5) : new THREE.LineCurve3(pts[0], pts.at(-1));
      const length = curve.getLength();
      this.motion = { curve, length, duration: Math.max(0.6, length / (WALK_SPEED * (m.type === "climb" ? 0.6 : 1))) };
    } else {
      this.motion = { duration: LOOK_TIME, startYaw: this.currentYaw() };
    }
    this.report();
  }

  currentYaw() {
    const d = this.target.clone().sub(this.camera.position);
    return Math.atan2(d.x, d.z);
  }

  report() {
    const m = this.moves[this.index];
    const before = this.moves.slice(0, this.index + 1).reverse().find((x) => x.type === "look");
    const next = this.moves.slice(this.index).find((x) => x.type === "look");
    const shown = m?.type === "look" ? m : next ?? before;
    this.onChange({ move: m, index: this.index, room: shown ? { name: shown.name, index: shown.index, total: shown.total, here: m?.type === "look" } : null, paused: this.paused, climbing: m?.type === "climb", done: !m });
  }

  setPaused(p) { this.paused = p; this.last = 0; this.report(); }

  /** Goes on after a pause; the view may have been turned or moved by hand meanwhile — back to the route first. */
  resume() {
    const m = this.moves[this.index];
    if (m && this.motion) {
      const pos = m.type === "look" ? this.startOf(m) : this.motion.curve.getPointAt(Math.min(1, Math.max(0, this.t)));
      const yaw = this.currentYaw();
      if (m.type !== "look") this.yaw = yaw;
      else this.motion.startYaw = yaw - ease(Math.min(1, this.t)) * Math.PI * 2;
      if (pos.distanceTo(this.camera.position) > 0.05) this.glide(pos, this.ahead(pos, yaw), 600);
    }
    this.setPaused(false);
  }

  setSpeed(s) { this.speed = s; }

  /** Jumps to the previous / next room (its look round). */
  skip(dir) {
    const looks = this.moves.map((m, i) => (m.type === "look" ? i : -1)).filter((i) => i >= 0);
    if (!looks.length) return;
    const now = this.index;
    const to = dir > 0 ? looks.find((i) => i > now) : ([...looks].reverse().find((i) => i < now) ?? looks[0]);
    if (to == null) { this.finish(); return; }
    const p = this.startOf(this.moves[to]);
    this.paused = false;
    this.glide(p, this.ahead(p, this.currentYaw()), 700);
    this.go(to);
  }

  /** One frame; true while the player holds the camera. */
  step(now) {
    if (this.paused) { this.last = 0; return false; }
    if (this.wait) {
      if (now < this.wait || this.viewer.isAnimating()) { this.last = now; return false; } // the viewer's glide moves the camera
      this.wait = 0;
    }
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (!this.motion) return false;
    const m = this.moves[this.index];
    this.t += (dt * this.speed) / this.motion.duration;
    const k = Math.min(1, this.t);
    const cam = this.camera;
    if (m.type === "look") {
      // A full turn, slow at the start and the end.
      const yaw = this.motion.startYaw + ease(k) * Math.PI * 2;
      this.target.copy(this.ahead(cam.position, yaw));
    } else {
      const pos = this.motion.curve.getPointAt(k);
      const aheadAt = Math.min(1, k + Math.min(0.5, 1.2 / Math.max(0.5, this.motion.length)));
      const dir = this.motion.curve.getPointAt(aheadAt).sub(pos);
      cam.position.copy(pos);
      if (m.type === "walk") dir.y = 0;
      // The view turns towards where the walk goes (smoothly).
      let yaw = this.yaw ?? this.currentYaw();
      if (dir.lengthSq() > 1e-6) {
        let dy = Math.atan2(dir.x, dir.z) - yaw;
        while (dy > Math.PI) dy -= 2 * Math.PI;
        while (dy < -Math.PI) dy += 2 * Math.PI;
        yaw += dy * Math.min(1, dt * 3.2 * this.speed);
      }
      this.yaw = yaw;
      const pitch = m.type === "climb" ? Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 0.6 : -0.06;
      this.target.set(pos.x + Math.sin(yaw) * 2, pos.y + Math.tan(pitch) * 2, pos.z + Math.cos(yaw) * 2);
    }
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    if (this.t >= 1) { if (m.type === "look") this.yaw = null; this.go(this.index + 1); }
    return true;
  }

  finish() {
    this.motion = null;
    this.index = this.moves.length;
    this.report();
  }

  /** Ends the tour; `restore` glides back to the view it started from. */
  stop({ restore = true } = {}) {
    this.viewer.setDriver(null);
    if (restore && this.saved) this.viewer.setCamera(this.saved, 700);
  }
}
