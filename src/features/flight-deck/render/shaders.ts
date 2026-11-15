/**
 * GLSL for the flight deck. WebGL2 / GLSL ES 3.00.
 *
 * Note for anyone editing these: the shader bodies live inside template
 * literals, so a backtick anywhere in a comment below would end the literal
 * and break the build. Write comments without them.
 */

// --------------------------------------------------------------------- sky
// Drawn first as a full-screen triangle with depth writes off, so it shows
// through the bow aperture and nowhere else. There is no skybox texture: the
// starfield and the planet are evaluated per pixel from the view ray.

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
uniform vec3 uPlanetDir;     // unit vector toward the planet
uniform float uPlanetRadius; // angular radius, radians
uniform vec3 uSunDir;

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i);
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

float fbm3(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise3(p);
    p *= 2.07;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 dir = normalize(uFwd + uRight * (vNdc.x * uAspect * uTanHalfFov) + uUp * (vNdc.y * uTanHalfFov));

  // Starfield: quantise the direction into cells and light a few of them.
  vec3 cell = floor(dir * 260.0);
  float star = hash31(cell);
  float brightness = smoothstep(0.9965, 1.0, star);
  // A slow scintillation, different per star so they do not blink together.
  float twinkle = 0.75 + 0.25 * sin(uTime * 1.3 + star * 90.0);
  vec3 col = vec3(brightness * twinkle);
  // A few warmer and cooler stars rather than a field of identical white.
  col *= mix(vec3(0.75, 0.84, 1.0), vec3(1.0, 0.9, 0.78), hash31(cell + 3.1));

  // Faint band of distant light, so the window is never a dead black rectangle.
  float band = exp(-abs(dir.y) * 3.4) * 0.022;
  col += vec3(0.30, 0.36, 0.52) * band;

  // The planet.
  float cosAng = dot(dir, uPlanetDir);
  float cosR = cos(uPlanetRadius);
  if (cosAng > cosR) {
    // Reconstruct a surface normal from where the ray lands on the disc.
    float ang = acos(clamp(cosAng, -1.0, 1.0));
    float k = ang / uPlanetRadius;            // 0 at centre, 1 at limb
    vec3 toEdge = normalize(dir - uPlanetDir * cosAng);
    float sinN = clamp(k, 0.0, 1.0);
    vec3 n = normalize(uPlanetDir * sqrt(max(0.0, 1.0 - sinN * sinN)) * -1.0 + toEdge * sinN);
    n = normalize(mix(-uPlanetDir, n, 1.0));

    float lambert = clamp(dot(n, uSunDir), 0.0, 1.0);
    // Terminator softened a little, as an atmosphere would.
    lambert = pow(lambert, 0.85);

    vec3 surface = vec3(0.42, 0.22, 0.13);
    float bands = fbm3(n * 4.2 + vec3(0.0, uTime * 0.004, 0.0));
    surface = mix(surface, vec3(0.56, 0.34, 0.2), bands);
    // Polar brightening and a dark basin or two.
    surface = mix(surface, vec3(0.78, 0.76, 0.72), smoothstep(0.72, 0.95, abs(n.y)) * 0.75);
    surface = mix(surface, vec3(0.3, 0.16, 0.1), smoothstep(0.55, 0.8, fbm3(n * 2.1 + 11.0)) * 0.5);

    vec3 lit = surface * (lambert * 1.18 + 0.025);
    // Limb haze
    float limb = smoothstep(0.86, 1.0, k);
    lit += vec3(0.5, 0.33, 0.26) * limb * lambert * 0.5;

    float edge = 1.0 - smoothstep(0.985, 1.0, k);
    col = mix(col, lit, edge);
  }

  outColor = vec4(col, 1.0);
}`

// ------------------------------------------------------------------- scene
// One pass over the interior. A cool key from the deck-head, a dim fill, and
// a handful of point lights standing in for the console screens, which is what
// makes the consoles pool light onto the deck around them.

export const SCENE_VERT = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;

uniform mat4 uViewProj;

out vec3 vPos;
out vec3 vNormal;
out vec3 vColor;

void main() {
  vPos = aPos;
  vNormal = aNormal;
  vColor = aColor;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`

export const SCENE_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec3 vPos;
in vec3 vNormal;
in vec3 vColor;
out vec4 outColor;

const int MAX_LIGHTS = 12;
uniform vec3 uLightPos[MAX_LIGHTS];
uniform vec3 uLightCol[MAX_LIGHTS];
uniform int uLightCount;
uniform vec3 uEye;
uniform float uAlert;   // 0..1, raised when the engine has something to say

void main() {
  vec3 n = normalize(vNormal);
  // Geometry is double-sided; face the normal toward the viewer.
  if (!gl_FrontFacing) n = -n;
  vec3 albedo = vColor;

  // Ambient, slightly stronger looking up: the deck-head runs carry the room.
  float sky = 0.5 + 0.5 * n.y;
  vec3 col = albedo * mix(vec3(0.052, 0.056, 0.07), vec3(0.14, 0.152, 0.175), sky);

  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec3 d = uLightPos[i] - vPos;
    float dist2 = dot(d, d);
    vec3 l = d * inversesqrt(max(dist2, 1e-4));
    float lambert = clamp(dot(n, l), 0.0, 1.0);
    // Inverse-square with a soft floor so nothing blows out up close.
    float atten = 1.0 / (1.0 + dist2 * 0.42);
    col += albedo * uLightCol[i] * lambert * atten;

    // A tight specular lifts the metal trim without a texture.
    vec3 v = normalize(uEye - vPos);
    vec3 h = normalize(l + v);
    float spec = pow(clamp(dot(n, h), 0.0, 1.0), 48.0);
    col += uLightCol[i] * spec * atten * 0.1;
  }

  // When something needs attention the deck picks up a trace of amber. It is
  // deliberately slight: this is a status cue, not an alarm.
  col = mix(col, col * vec3(1.25, 1.02, 0.72), uAlert * 0.35);

  // Filmic-ish compression, then a gentle lift so the blacks are not crushed.
  col = col / (col + vec3(0.72));
  col = pow(col, vec3(0.4545));
  outColor = vec4(col, 1.0);
}`

// ---------------------------------------------------------------- emissive
// Screens and light runs, drawn without lighting and added to the frame.

export const EMISSIVE_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec3 vPos;
in vec3 vNormal;
in vec3 vColor;
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

  // Upright faces are screens; the deck-head runs are flat and stay smooth.
  float upright = 1.0 - abs(normalize(vNormal).y);

  // Rows of unequal brightness, so a console reads as a display with content
  // on it rather than as a lamp. At this distance that is all the eye needs.
  float row = floor(vPos.y * 26.0);
  float rowLum = 0.42 + 0.58 * hash21(vec2(row, 2.3));
  float gap = smoothstep(0.52, 0.72, fract(vPos.y * 26.0));
  col *= mix(1.0, rowLum * (1.0 - gap * 0.55), upright);

  // A header band across the top of each screen.
  col *= 1.0 + upright * smoothstep(1.72, 1.8, vPos.y) * 0.8;

  float lines = 0.5 + 0.5 * sin(vPos.y * 190.0);
  col *= 1.0 - upright * lines * 0.14;

  // A slow horizontal refresh, and a little static, both very faint.
  float sweep = smoothstep(0.86, 1.0, sin(vPos.y * 2.1 - uTime * 0.85));
  col += col * sweep * 0.28 * upright;
  col += (hash21(vPos.xy * 90.0 + floor(uTime * 12.0)) - 0.5) * 0.02;

  col = mix(col, vec3(0.62, 0.42, 0.16), uAlert * 0.55 * upright);

  col = col / (col + vec3(0.72));
  col = pow(col, vec3(0.4545));
  outColor = vec4(col, 1.0);
}`
