/**
 * SIGNAL VEIL — fog shader (WebGL2 / GLSL ES 3.00)
 *
 * A single full-screen pass composites a fogged visor over the live
 * constellation. Nothing is pre-rendered: the fog body, the condensation
 * beads, the sliding drops and the wipe edges are all generated per pixel.
 *
 * Inputs
 *   uScene  the constellation, re-uploaded every frame with a full mip chain.
 *           High mip levels give the frosted-glass blur; low levels are
 *           sampled through each bead so beads act as small lenses.
 *   uMask   the wipe mask (1 = wiped clear), a low-resolution field. The
 *           shader perturbs it with noise so wiped edges look streaked.
 *
 * Output is premultiplied. Alpha falls to zero where the glass is clear, so
 * the crisp 2D canvas underneath shows through untouched.
 */

export const FOG_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  // uv origin at the top-left, matching canvas and pointer coordinates.
  vUv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}
`

export const FOG_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform sampler2D uMask;
uniform vec2 uRes;      // drawing-buffer size in pixels
uniform float uTime;    // seconds; frozen under prefers-reduced-motion
uniform float uFog;     // global fog amount, 1 = fully fogged, 0 = dissolved
uniform vec4 uLens;     // xy = centre (uv), z = radius (fraction of height), w = 1 when active
uniform vec2 uPointer;  // pointer position (uv), for a faint moving highlight

in vec2 vUv;
out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 17.13));
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float amp = 0.5;
  float sum = 0.0;
  for (int i = 0; i < 5; i++) {
    sum += amp * vnoise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    amp *= 0.5;
  }
  return sum;
}

// A layer of sessile condensation beads on a jittered grid.
// xy = accumulated surface normal, z = coverage.
vec3 beadLayer(vec2 p, float scale, float seed, float density) {
  vec2 g = p * scale;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec3 acc = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 cid = id + o;
      if (hash21(cid + seed) > density) continue;
      vec2 jitter = (hash22(cid + seed * 1.7) - 0.5) * 0.7;
      float rad = mix(0.09, 0.33, hash21(cid * 1.31 + seed + 4.2));
      vec2 d = f - o - jitter;
      d.y *= mix(0.9, 1.14, hash21(cid + seed + 9.0));
      float dist = length(d);
      float m = smoothstep(rad, rad * 0.7, dist);
      if (m > 0.0) {
        acc.xy += (d / rad) * m;
        acc.z = max(acc.z, m);
      }
    }
  }
  return acc;
}

// Beads that slide slowly down the glass with a stick-slip motion, each
// leaving a narrow wet trail. x = trail, y = bead coverage, zw = bead normal.
vec4 runners(vec2 p, float t) {
  const float COLS = 7.0;
  float gx = p.x * COLS;
  float col = floor(gx);
  float fx = fract(gx) - 0.5;
  float h = hash21(vec2(col, 3.7));
  if (h > 0.6) return vec4(0.0);
  float speed = mix(0.012, 0.03, hash21(vec2(col, 9.1)));
  float cycle = t * speed + h * 7.0;
  float k = floor(cycle);
  float ph = fract(cycle);
  float y = (ph + 0.03 * sin(ph * 31.0 + h * 6.28318)) * 1.3 - 0.15;
  float xoff = (hash21(vec2(col, k)) - 0.5) * 0.5 + 0.07 * sin(y * 13.0 + h * 40.0) + 0.03 * sin(y * 41.0 + h * 9.0);
  vec2 d = vec2((fx - xoff) / COLS, (p.y - y) * 0.8);
  float r = mix(0.010, 0.018, hash21(vec2(col, k + 2.0)));
  float bead = smoothstep(r, r * 0.6, length(d));
  float above = y - p.y;
  float w = r * 0.6;
  float trail = smoothstep(w, w * 0.3, abs(d.x)) * smoothstep(0.0, 0.02, above) * smoothstep(0.6, 0.0, above);
  return vec4(trail, bead, (d / r) * bead);
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime;

  // ---- Wipe mask, with streaked edges as if cleared by a gloved hand.
  float clearRaw = texture(uMask, uv).r;
  float streak = fbm(p * 13.0 + 3.1) * 0.55 + vnoise(p * vec2(70.0, 8.0) + 11.0) * 0.25;
  float edgeZone = 1.0 - abs(clearRaw * 2.0 - 1.0);
  float clear = smoothstep(0.2, 0.86, clearRaw + (streak - 0.45) * 0.95 * edgeZone);
  vec2 maskGrad = vec2(dFdx(clearRaw), dFdy(clearRaw));
  float wipeEdge = clamp(length(maskGrad) * 26.0, 0.0, 1.0);

  // ---- Fog body: slow-drifting fractal density.
  float body = fbm(p * 2.1 + vec2(t * 0.011, -t * 0.007));
  float fine = fbm(p * 8.5 - vec2(0.0, t * 0.018));
  // During the dissolve the thinnest fog goes first.
  float amount = clamp(uFog * 1.5 - (1.0 - body) * 0.5, 0.0, 1.0);
  float density = mix(0.74, 1.0, body) * (0.9 + 0.1 * fine);
  float fogged = amount * (1.0 - clear);
  // Runners are scaled by fogged wherever they are used, so on glass that has
  // been wiped they contribute nothing. Skipping them there is free.
  vec4 run = fogged > 0.002 ? runners(p, t) : vec4(0.0);
  float fog = fogged * density * (1.0 - run.x * 0.62);

  // ---- Condensation beads. They sit on fogged glass and gather along wipe edges.
  float presence = clamp(fogged * 0.85 + wipeEdge * amount * 0.9, 0.0, 1.0);
  // Both bead layers are scaled by presence, so where the glass is clear and
  // away from a wipe edge they cannot contribute. These two calls are the most
  // expensive thing in the shader — nine jittered cells each — so skipping them
  // on cleared glass is where most of the cost goes as the visor is wiped.
  vec3 b1 = vec3(0.0);
  vec3 b2 = vec3(0.0);
  if (presence > 0.004) {
    b1 = beadLayer(p, 27.0, 1.0, 0.5);
    b2 = beadLayer(p, 14.0, 7.0, 0.2);
  }
  float runPresence = fogged;
  vec2 normal = (b1.xy * 0.6 + b2.xy) * presence + run.zw * runPresence;
  float bead = clamp(max(b1.z * 0.75, b2.z) * presence + run.y * runPresence, 0.0, 1.0);

  // ---- The scene through the glass.
  float lod = fog * 5.2;
  vec2 warp = (vec2(body, fine) - 0.5) * 0.008 * fog;
  vec3 frosted = textureLod(uScene, uv + warp, lod).rgb;
  // Each bead refracts a small, sharper, displaced view.
  vec3 throughBead = textureLod(uScene, uv - normal * 0.03, 1.2).rgb;
  // A bead is mostly a clear view, with a little of the surrounding haze left in it.
  vec3 col = mix(frosted, mix(throughBead, frosted, 0.22), bead * 0.88);

  // Scattering lifts the blacks and bleeds light from bright signals beneath.
  vec3 fogTint = vec3(0.50, 0.58, 0.72);
  float scatter = fog * (0.3 + 0.1 * body) * (1.0 - bead * 0.7);
  col = mix(col, fogTint, scatter);
  col += textureLod(uScene, uv, 6.6).rgb * fog * 0.6;

  // Bead lighting: a key light from the upper left, plus a dim contact shadow.
  vec3 n3 = normalize(vec3(normal, 0.65));
  float spec = pow(clamp(dot(n3, normalize(vec3(-0.5, -0.62, 0.6))), 0.0, 1.0), 20.0) * bead;
  col += spec * vec3(0.9, 0.95, 1.0) * 0.75;
  // Light gathered on the far side of each bead: the bright crescent that makes water read as water.
  float crescent = pow(clamp(dot(normal, normalize(vec2(0.55, 0.7))), 0.0, 1.0), 2.2) * bead;
  col += crescent * fogTint * 0.42 * (0.4 + 0.6 * amount);
  col *= 1.0 - bead * 0.05 * (1.0 - spec) * (1.0 - crescent);

  // ---- Visor glass: edge falloff, a soft reflection band, a pointer glint.
  vec2 c = uv - 0.5;
  float rim = smoothstep(0.36, 0.74, length(c * vec2(0.92, 1.16)));
  col += rim * vec3(0.08, 0.13, 0.22) * (0.3 + 0.7 * amount);
  float band = smoothstep(0.0, 1.0, 1.0 - abs((uv.y + uv.x * 0.22 - 0.3) * 4.5));
  col += band * 0.03 * amount * (1.0 - clear);
  float glint = exp(-dot((uv - uPointer) * vec2(aspect, 1.0), (uv - uPointer) * vec2(aspect, 1.0)) * 26.0);
  col += glint * 0.035 * fogged;
  // Fine grain keeps the fog from banding.
  col += (hash21(uv * uRes + fract(t) * 91.0) - 0.5) * 0.012 * fogged;

  float alpha = clamp(fog * 1.3 + bead * 0.92 + rim * 0.22 * amount, 0.0, 1.0);

  // ---- Breath. Each exhale briefly mists the glass in front of the mouth, then fades.
  // It never touches the wipe mask, so whatever has been wiped stays wiped, and it
  // stops once the visor is fully clear.
  float exhale = pow(0.5 + 0.5 * sin(t * 1.3), 3.0);
  float mouth = exp(-pow((uv.x - 0.5) * aspect * 2.1, 2.0)) * smoothstep(0.72, 1.0, uv.y);
  float breath = exhale * mouth * (0.55 + 0.45 * fine) * 0.36 * smoothstep(0.0, 0.25, uFog);
  col = mix(col, fogTint * 1.06, breath);
  alpha = max(alpha, breath);

  // ---- Data lens: a clear, magnified disc with a glass rim.
  if (uLens.w > 0.5) {
    vec2 ld = (uv - uLens.xy) * vec2(aspect, 1.0);
    float dist = length(ld);
    float r = uLens.z;
    if (dist < r * 1.1) {
      float inside = smoothstep(r, r * 0.97, dist);
      float k = dist / r;
      // Gentle barrel magnification, stronger toward the centre.
      vec2 zuv = uLens.xy + (uv - uLens.xy) / (1.38 - 0.22 * k * k);
      vec3 mag = textureLod(uScene, zuv, 0.0).rgb;
      mag += pow(k, 6.0) * vec3(0.05, 0.08, 0.14);
      col = mix(col, mag, inside);
      alpha = max(alpha, inside);
      float ring = smoothstep(r * 1.035, r * 1.0, dist) * smoothstep(r * 0.955, r * 0.99, dist);
      float light = 0.55 + 0.45 * dot(normalize(ld + 1e-5), normalize(vec2(-0.6, -0.8)));
      col = mix(col, vec3(0.62, 0.78, 1.0) * light, ring * 0.9);
      alpha = max(alpha, ring);
      float halo = smoothstep(r * 1.1, r * 1.03, dist) * (1.0 - smoothstep(r * 1.03, r * 1.0, dist));
      alpha = max(alpha, halo * 0.35);
      col = mix(col, vec3(0.0), halo * 0.35 * (1.0 - ring));
    }
  }

  outColor = vec4(col * alpha, alpha);
}
`
