/**
 * GLSL for the flight deck. WebGL2 / GLSL ES 3.00.
 *
 * Note for anyone editing these: the shader bodies live inside template
 * literals, so a backtick anywhere in a comment below would end the literal
 * and break the build. Write comments without them.
 *
 * On ray tracing: WebGL2 has no ray-tracing pipeline, so nothing here traces
 * rays through the interior. What it does instead is the set of things that
 * actually produce that look at sixty frames a second — a microfacet BRDF with
 * real roughness and metalness, a shadow map so sunlight through the cupola
 * throws the window pattern across the deck, ambient occlusion baked per
 * vertex against the deck plan, and a hemispheric ambient term standing in for
 * bounce off the white rack faces. The planet is the one thing genuinely
 * traced: an analytic ray-sphere intersection evaluated per pixel.
 */

const PBR_COMMON = /* glsl */ `
const float PI = 3.14159265359;

float distributionGGX(vec3 N, vec3 H, float rough) {
  float a = rough * rough;
  float a2 = a * a;
  float ndh = max(dot(N, H), 0.0);
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-5);
}

float geometrySchlick(float ndv, float rough) {
  float r = rough + 1.0;
  float k = (r * r) / 8.0;
  return ndv / (ndv * (1.0 - k) + k);
}

float geometrySmith(float ndv, float ndl, float rough) {
  return geometrySchlick(ndv, rough) * geometrySchlick(ndl, rough);
}

vec3 fresnelSchlick(float cosT, vec3 f0) {
  return f0 + (1.0 - f0) * pow(clamp(1.0 - cosT, 0.0, 1.0), 5.0);
}

// ACES approximation. Keeps highlights off white panels from going chalky when
// sunlight comes through the cupola.
vec3 tonemapACES(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
`

// ------------------------------------------------------------- shadow pass
export const DEPTH_VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform mat4 uLightViewProj;
uniform mat4 uModel;
void main() { gl_Position = uLightViewProj * uModel * vec4(aPos, 1.0); }`

export const DEPTH_FRAG = /* glsl */ `#version 300 es
precision highp float;
void main() {}`

// --------------------------------------------------------------- sky/Earth
export const SKY_VERT = /* glsl */ `#version 300 es
precision highp float;
out vec2 vNdc;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`

export const SKY_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vNdc;
out vec4 outColor;

uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uAspect;
uniform float uTanHalfFov;
uniform float uTime;
uniform vec3 uEarthDir;
uniform float uEarthDist;
uniform float uEarthR;
uniform vec3 uSunDir;
uniform int uOct;   // octave budget, from the quality preset

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
                 mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
                 mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}

float fbm(vec3 p, int oct) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * noise3(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}

// Rotation about Y: the ground drifting under the orbit.
vec3 spin(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

void main() {
  vec3 dir = normalize(uFwd + uRight * (vNdc.x * uAspect * uTanHalfFov) + uUp * (vNdc.y * uTanHalfFov));

  // ---- starfield
  vec3 cell = floor(dir * 300.0);
  float star = hash31(cell);
  float bright = smoothstep(0.9972, 1.0, star);
  float twinkle = 0.8 + 0.2 * sin(uTime * 1.1 + star * 90.0);
  vec3 col = vec3(bright * twinkle) * mix(vec3(0.76, 0.84, 1.0), vec3(1.0, 0.9, 0.78), hash31(cell + 3.1));

  vec3 C = uEarthDir * uEarthDist;
  float b = dot(dir, C);
  float cc = dot(C, C);
  float disc = b * b - (cc - uEarthR * uEarthR);
  float atmoR = uEarthR * 1.025;
  float discA = b * b - (cc - atmoR * atmoR);

  if (disc > 0.0 && b > 0.0) {
    vec3 pos = dir * (b - sqrt(disc));
    vec3 n = normalize(pos - C);
    vec3 ns = spin(n, uTime * 0.0045);

    float sun = dot(n, uSunDir);
    float day = smoothstep(-0.10, 0.24, sun);

    // Continents. The scale matters more than anything else here: ns is a unit
    // vector, so a low multiplier gives only a handful of noise cells over the
    // whole globe and the planet turns to blobs. These are tuned so the land
    // masses are continent-sized and the coastlines carry fine detail.
    // From a 420 km orbit a single screen covers a small patch of the globe,
    // so continent-scale noise alone reads as smooth blobs. These run to seven
    // and five octaves respectively, which carries the terrain down to
    // something like coastline scale at this altitude.
    float land = fbm(ns * 3.4, min(7, uOct));
    float detail = fbm(ns * 38.0, min(5, uOct));
    float mask = smoothstep(0.545, 0.60, land + detail * 0.06);

    vec3 ocean = mix(vec3(0.006, 0.028, 0.085), vec3(0.016, 0.075, 0.20), smoothstep(0.3, 0.62, land));
    vec3 green = mix(vec3(0.052, 0.082, 0.040), vec3(0.145, 0.138, 0.075), detail);
    vec3 arid = vec3(0.315, 0.245, 0.135);
    vec3 ground = mix(green, arid, smoothstep(0.42, 0.70, fbm(ns * 9.0 + 19.0, min(4, uOct))));
    vec3 surface = mix(ocean, ground, mask);
    float lat = abs(ns.y);
    surface = mix(surface, vec3(0.74, 0.78, 0.84), smoothstep(0.82, 0.96, lat));

    // Cloud deck, drifting independently of the ground.
    vec3 cp = spin(n, uTime * 0.0045 + 0.4) * 9.0 + vec3(uTime * 0.006, 0.0, 0.0);
    float cloud = smoothstep(0.50, 0.78, fbm(cp, min(6, uOct)));
    cloud *= 0.5 + 0.5 * smoothstep(0.15, 0.65, fbm(cp * 3.1, min(4, uOct)));
    cloud *= 0.6 + 0.6 * smoothstep(0.05, 0.4, abs(sin(ns.y * 3.1)));
    cloud = clamp(cloud, 0.0, 1.0);

    float ndv = clamp(dot(n, -dir), 0.0, 1.0);
    float oceanSpec = (1.0 - mask) * pow(1.0 - ndv, 4.0);
    float specular = pow(max(dot(reflect(-uSunDir, n), -dir), 0.0), 60.0) * oceanSpec * 3.0;

    vec3 lit = surface * day * 1.0;
    lit = mix(lit, vec3(0.86, 0.885, 0.93) * day, cloud * 0.93);
    lit += vec3(1.0, 0.96, 0.9) * specular * day * 0.8;

    // Night side: city lights on land, faint airglow elsewhere
    float night = 1.0 - day;
    float cities = mask * smoothstep(0.62, 0.80, fbm(ns * 70.0, min(4, uOct))) * smoothstep(0.0, 0.35, 1.0 - lat);
    lit += vec3(1.0, 0.72, 0.36) * cities * night * 0.5 * (1.0 - cloud * 0.8);
    lit += vec3(0.035, 0.085, 0.14) * night * 0.12;

    // Atmosphere thickening toward the limb
    lit += vec3(0.20, 0.38, 0.78) * pow(1.0 - ndv, 2.8) * day * 0.75;

    col = lit;
  } else if (discA > 0.0 && b > 0.0) {
    // Grazes the atmosphere but misses the ground: the blue rim.
    vec3 n = normalize(dir * (b - sqrt(discA)) - C);
    float sun = smoothstep(-0.25, 0.35, dot(n, uSunDir));
    float thick = sqrt(discA) / max(atmoR - uEarthR, 1e-4) * 0.5;
    float glow = exp(-thick * 1.1) * sun;
    col += vec3(0.22, 0.45, 0.95) * glow * 1.3;
    col += vec3(0.6, 0.78, 1.0) * pow(glow, 3.0) * 0.55;
  }

  // Same filmic curve as the interior, so the planet rolls off into highlight
  // instead of clipping to paper white at the sub-solar point.
  col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
  col = pow(col, vec3(0.4545));
  outColor = vec4(col, 1.0);
}`

// ------------------------------------------------------------------- scene
export const SCENE_VERT = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
layout(location = 3) in vec3 aMat;
layout(location = 4) in vec3 aIrradiance;

uniform mat4 uViewProj;
uniform mat4 uLightViewProj;
// Identity for the hull, which never moves. Set only for the hatch leaves,
// which are the one piece of geometry in the vessel that does.
uniform mat4 uModel;

out vec3 vPos;
out vec3 vNormal;
out vec3 vColor;
out vec3 vMat;
out vec3 vIrr;
out vec4 vLightPos;

void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vPos = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  vMat = aMat;
  vIrr = aIrradiance;
  vLightPos = uLightViewProj * world;
  gl_Position = uViewProj * world;
}`

export const SCENE_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DShadow;

in vec3 vPos;
in vec3 vNormal;
in vec3 vColor;
in vec3 vMat;
in vec3 vIrr;
in vec4 vLightPos;
out vec4 outColor;

${PBR_COMMON}

// Only the fixtures nearest the eye are sent now, and only so that their
// specular highlight can move with the viewer. The diffuse half of every
// fixture in the vessel arrives already summed, in vIrr.
const int MAX_LIGHTS = 4;
uniform vec3 uLightPos[MAX_LIGHTS];
uniform vec3 uLightCol[MAX_LIGHTS];
uniform int uLightCount;
uniform vec3 uEye;
uniform float uAlert;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform sampler2DShadow uShadow;
uniform float uShadowTexel;
uniform int uPcf;      // 1 for a hard edge, 9 for a soft one
uniform int uMaxLights;
uniform vec3 uEarthTint;
uniform vec3 uCupola;

float sunShadow() {
  vec3 p = vLightPos.xyz / vLightPos.w;
  p = p * 0.5 + 0.5;
  if (p.z > 1.0 || p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
  // Percentage-closer filtering turns the window edge into something nearer a
  // penumbra than a stencil. Nine taps on High, one on the cheaper presets:
  // the edge hardens, but nothing disappears from the room.
  if (uPcf < 4) return texture(uShadow, vec3(p.xy, p.z - 0.0022));
  float s = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      s += texture(uShadow, vec3(p.xy + vec2(float(x), float(y)) * uShadowTexel, p.z - 0.0022));
    }
  }
  return s / 9.0;
}

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uEye - vPos);
  float ndv = max(dot(N, V), 1e-4);

  vec3 albedo = vColor;
  float rough = clamp(vMat.x, 0.06, 1.0);
  float metal = clamp(vMat.y, 0.0, 1.0);
  float ao = clamp(vMat.z, 0.0, 1.0);

  vec3 f0 = mix(vec3(0.04), albedo, metal);
  vec3 kd = albedo * (1.0 - metal);
  vec3 lo = vec3(0.0);

  // Sunlight through the cupola, shadow-mapped.
  vec3 L = normalize(uSunDir);
  float ndl = max(dot(N, L), 0.0);
  if (ndl > 0.0) {
    float shadow = sunShadow();
    if (shadow > 0.0) {
      vec3 H = normalize(L + V);
      float D = distributionGGX(N, H, rough);
      float G = geometrySmith(ndv, ndl, rough);
      vec3 F = fresnelSchlick(max(dot(H, V), 0.0), f0);
      vec3 spec = (D * G * F) / max(4.0 * ndv * ndl, 1e-4);
      lo += (kd / PI + spec) * uSunCol * ndl * shadow;
    }
  }

  // Interior fixtures, diffuse half: summed at build time over every fixture
  // in the vessel, with visibility, and interpolated across the triangle.
  // This replaced a sixteen-iteration per-pixel loop that profiling put at
  // 85 per cent of this pass.
  lo += kd / PI * vIrr;

  // Interior fixtures, specular half. This cannot be baked, because the
  // highlight sits where the eye happens to be. It is also only visible on
  // surfaces smooth enough to hold one, so the whole block is skipped on the
  // painted rack faces that make up most of the station's area — a branch the
  // hardware takes coherently, since roughness varies per surface and not per
  // pixel. What remains is the handful of fixtures nearest the eye, which is
  // all that can produce a highlight a viewer would notice.
  float gloss = (1.0 - rough) * (0.35 + 0.65 * metal);
  if (gloss > 0.06) {
    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= uLightCount || i >= uMaxLights) break;
      vec3 d = uLightPos[i] - vPos;
      float dist2 = max(dot(d, d), 1e-4);
      if (dist2 > 90.0) continue;
      vec3 Li = d * inversesqrt(dist2);
      float nl = max(dot(N, Li), 0.0);
      if (nl <= 0.0) continue;
      vec3 H = normalize(Li + V);
      float D = distributionGGX(N, H, rough);
      float G = geometrySmith(ndv, nl, rough);
      vec3 F = fresnelSchlick(max(dot(H, V), 0.0), f0);
      vec3 spec = (D * G * F) / max(4.0 * ndv * nl, 1e-4);
      lo += spec * uLightCol[i] * nl * (1.0 / (1.0 + dist2 * 0.33));
    }
  }

  // Ambient: a hemisphere standing in for bounce off the white rack faces,
  // plus a cool wash from the planet in through the cupola.
  vec3 ambient = mix(vec3(0.050, 0.050, 0.055), vec3(0.112, 0.118, 0.132), N.y * 0.5 + 0.5) * albedo * ao;

  vec3 toCupola = uCupola - vPos;
  float cupDist2 = max(dot(toCupola, toCupola), 1.0);
  vec3 cupL = toCupola * inversesqrt(cupDist2);
  ambient += uEarthTint * albedo * max(dot(N, cupL), 0.0) * ao * (14.0 / (14.0 + cupDist2));

  // A grazing sheen, so painted metal does not read as matte paper.
  ambient += fresnelSchlick(ndv, f0) * (1.0 - rough) * 0.085 * ao;

  vec3 col = lo + ambient;
  col = mix(col, col * vec3(1.2, 1.01, 0.76), uAlert * 0.3);
  col = tonemapACES(col * 1.08);
  col = pow(col, vec3(0.4545));
  outColor = vec4(col, 1.0);
}`

// --------------------------------------------------------- sky composite
/**
 * Puts the offscreen planet onto the frame.
 *
 * The planet is drawn into a smaller target and brought up to size here. It
 * can afford that because it is the one thing in the frame with no hard edges
 * in it: an ocean, a cloud deck and a limb, all low frequency, seen through a
 * pane at least a few metres away. The structure around the panes is drawn at
 * full resolution and is unaffected, so the window frames stay sharp while the
 * view through them costs a fraction of what it did.
 */
export const SKY_COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vNdc;
uniform sampler2D uSky;
out vec4 outColor;
void main() {
  outColor = vec4(texture(uSky, vNdc * 0.5 + 0.5).rgb, 1.0);
}`

// ---------------------------------------------------------------- emissive
export const EMISSIVE_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec3 vPos;
in vec3 vNormal;
in vec3 vColor;
in vec3 vMat;
in vec4 vLightPos;
out vec4 outColor;

uniform float uTime;
uniform float uAlert;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec3 col = vColor;
  float upright = 1.0 - abs(normalize(vNormal).y);

  // Upright faces are displays: rows of unequal brightness read as content.
  float row = floor(vPos.y * 30.0);
  float rowLum = 0.45 + 0.55 * hash21(vec2(row, 2.3));
  float gap = smoothstep(0.55, 0.75, fract(vPos.y * 30.0));
  col *= mix(1.0, rowLum * (1.0 - gap * 0.5), upright);
  col *= 1.0 + upright * smoothstep(1.5, 1.57, vPos.y) * 0.7;
  col *= 1.0 - upright * (0.5 + 0.5 * sin(vPos.y * 210.0)) * 0.12;
  col += col * smoothstep(0.88, 1.0, sin(vPos.y * 2.0 - uTime * 0.8)) * 0.22 * upright;
  col += (hash21(vPos.xy * 90.0 + floor(uTime * 12.0)) - 0.5) * 0.016;

  col = mix(col, vec3(0.6, 0.4, 0.14), uAlert * 0.5 * upright);
  col = col / (col + vec3(0.8));
  col = pow(col, vec3(0.4545));
  outColor = vec4(col, 1.0);
}`
