/**
 * The four 4x4 operations this renderer needs, and nothing else.
 * Column-major, matching what WebGL expects from uniformMatrix4fv.
 */

export type Mat4 = Float32Array

export function identity(out: Mat4 = new Float32Array(16)): Mat4 {
  out.fill(0)
  out[0] = out[5] = out[10] = out[15] = 1
  return out
}

export function perspective(fovY: number, aspect: number, near: number, far: number, out: Mat4 = new Float32Array(16)): Mat4 {
  const f = 1 / Math.tan(fovY / 2)
  const nf = 1 / (near - far)
  out.fill(0)
  out[0] = f / aspect
  out[5] = f
  out[10] = (far + near) * nf
  out[11] = -1
  out[14] = 2 * far * near * nf
  return out
}

export function multiply(a: Mat4, b: Mat4, out: Mat4 = new Float32Array(16)): Mat4 {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4]
    const b1 = b[c * 4 + 1]
    const b2 = b[c * 4 + 2]
    const b3 = b[c * 4 + 3]
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3
  }
  return out
}

/**
 * View matrix for a first-person camera at `eye` with yaw then pitch.
 * Forward at yaw 0, pitch 0 is -z, which is the convention the deck plan's
 * station reach test uses as well.
 */
export function fpsView(eyeX: number, eyeY: number, eyeZ: number, yaw: number, pitch: number, out: Mat4 = new Float32Array(16)): Mat4 {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  // Camera basis: right, up, backward (the third column of a view matrix is
  // the direction *out of* the screen).
  const rx = cy
  const ry = 0
  const rz = -sy
  const ux = sy * sp
  const uy = cp
  const uz = cy * sp
  const bx = sy * cp
  const by = -sp
  const bz = cy * cp
  out[0] = rx
  out[1] = ux
  out[2] = bx
  out[3] = 0
  out[4] = ry
  out[5] = uy
  out[6] = by
  out[7] = 0
  out[8] = rz
  out[9] = uz
  out[10] = bz
  out[11] = 0
  out[12] = -(rx * eyeX + ry * eyeY + rz * eyeZ)
  out[13] = -(ux * eyeX + uy * eyeY + uz * eyeZ)
  out[14] = -(bx * eyeX + by * eyeY + bz * eyeZ)
  out[15] = 1
  return out
}

/** Forward vector for a yaw/pitch pair, matching fpsView. */
export function forward(yaw: number, pitch: number): [number, number, number] {
  const cp = Math.cos(pitch)
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp]
}

export function orthographic(l: number, r: number, b: number, t: number, near: number, far: number, out: Mat4 = new Float32Array(16)): Mat4 {
  out.fill(0)
  out[0] = 2 / (r - l)
  out[5] = 2 / (t - b)
  out[10] = -2 / (far - near)
  out[12] = -(r + l) / (r - l)
  out[13] = -(t + b) / (t - b)
  out[14] = -(far + near) / (far - near)
  out[15] = 1
  return out
}

/** View matrix for the shadow pass: an eye looking at a target. */
export function lookAt(
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number],
  out: Mat4 = new Float32Array(16),
): Mat4 {
  let zx = eye[0] - target[0]
  let zy = eye[1] - target[1]
  let zz = eye[2] - target[2]
  const zl = Math.hypot(zx, zy, zz) || 1
  zx /= zl; zy /= zl; zz /= zl
  let xx = up[1] * zz - up[2] * zy
  let xy = up[2] * zx - up[0] * zz
  let xz = up[0] * zy - up[1] * zx
  const xl = Math.hypot(xx, xy, xz) || 1
  xx /= xl; xy /= xl; xz /= xl
  const yx = zy * xz - zz * xy
  const yy = zz * xx - zx * xz
  const yz = zx * xy - zy * xx
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2])
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2])
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2])
  out[15] = 1
  return out
}
