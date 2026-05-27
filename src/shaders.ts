import { outsideMotif } from './constants.ts'

export const vertex = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 color;
layout(location = 2) in float glow;
layout(location = 3) in float strobe;
layout(location = 4) in vec2 pattern;
layout(location = 5) in float haze;

uniform vec2 resolution;
uniform vec3 cameraEye;
uniform vec3 cameraCenter;

out vec3 shade;
out float light;
out vec2 patternUv;
out float hazeAmount;
out vec3 worldPosition;
flat out float strobeId;

mat4 perspective(float fov, float aspect, float near, float far) {
  float f = 1.0 / tan(fov * 0.5);

  return mat4(
    f / aspect, 0.0, 0.0, 0.0,
    0.0, f, 0.0, 0.0,
    0.0, 0.0, (far + near) / (near - far), -1.0,
    0.0, 0.0, (2.0 * far * near) / (near - far), 0.0
  );
}

mat4 lookAt(vec3 eye, vec3 center, vec3 up) {
  vec3 z = normalize(eye - center);
  vec3 x = normalize(cross(up, z));
  vec3 y = cross(z, x);

  return mat4(
    x.x, y.x, z.x, 0.0,
    x.y, y.y, z.y, 0.0,
    x.z, y.z, z.z, 0.0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1.0
  );
}

void main() {
  mat4 camera = lookAt(cameraEye, cameraCenter, vec3(0.0, 1.0, 0.0));
  mat4 projection = perspective(1.08, resolution.x / resolution.y, 0.1, 180.0);
  vec4 view = camera * vec4(position, 1.0);

  gl_Position = projection * view;
  shade = color;
  light = glow;
  patternUv = pattern;
  hazeAmount = haze;
  worldPosition = position;
  strobeId = strobe;
}
`

export const characterBoxVertex = `#version 300 es
precision highp float;

layout(location = 0) in vec3 boxPosition;
layout(location = 1) in float boxShade;
layout(location = 2) in vec3 instanceA;
layout(location = 3) in vec3 instanceB;
layout(location = 4) in vec3 instanceSide;
layout(location = 5) in vec3 instanceUp;
layout(location = 6) in vec3 instanceColor;
layout(location = 7) in float instanceGlow;
layout(location = 8) in float instanceStrobe;

uniform vec2 resolution;
uniform vec3 cameraEye;
uniform vec3 cameraCenter;

out vec3 shade;
out float light;
out vec2 patternUv;
out float hazeAmount;
out vec3 worldPosition;
flat out float strobeId;

mat4 perspective(float fov, float aspect, float near, float far) {
  float f = 1.0 / tan(fov * 0.5);

  return mat4(
    f / aspect, 0.0, 0.0, 0.0,
    0.0, f, 0.0, 0.0,
    0.0, 0.0, (far + near) / (near - far), -1.0,
    0.0, 0.0, (2.0 * far * near) / (near - far), 0.0
  );
}

mat4 lookAt(vec3 eye, vec3 center, vec3 up) {
  vec3 z = normalize(eye - center);
  vec3 x = normalize(cross(up, z));
  vec3 y = cross(z, x);

  return mat4(
    x.x, y.x, z.x, 0.0,
    x.y, y.y, z.y, 0.0,
    x.z, y.z, z.z, 0.0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1.0
  );
}

void main() {
  vec3 along = mix(instanceA, instanceB, boxPosition.z);
  vec3 position = along + instanceSide * boxPosition.x + instanceUp * boxPosition.y;
  mat4 camera = lookAt(cameraEye, cameraCenter, vec3(0.0, 1.0, 0.0));
  mat4 projection = perspective(1.08, resolution.x / resolution.y, 0.1, 180.0);
  vec4 view = camera * vec4(position, 1.0);

  gl_Position = projection * view;
  shade = instanceColor * boxShade;
  light = instanceGlow;
  patternUv = vec2(0.0);
  hazeAmount = 0.0;
  worldPosition = position;
  strobeId = instanceStrobe;
}
`

export const characterBoxFragment = `#version 300 es
precision highp float;

uniform int renderZone;

in vec3 shade;
in float light;
in vec2 patternUv;
in float hazeAmount;
in vec3 worldPosition;
flat in float strobeId;

out vec4 pixel;

bool sceneVisible() {
  bool outsidePoint = worldPosition.x < -7.05 || worldPosition.x > 7.05 || worldPosition.z < -24.05 || worldPosition.z > 4.05;
  bool shell = (
    abs(worldPosition.z - 4.0) < 0.18
    || abs(worldPosition.z + 24.0) < 0.18
    || abs(worldPosition.x - 7.0) < 0.18
    || abs(worldPosition.x + 7.0) < 0.18
  ) && worldPosition.y > -2.15 && worldPosition.y < 5.15;
  bool door = abs(worldPosition.z - 4.0) < 0.22
    && worldPosition.x > -5.75 && worldPosition.x < -3.75
    && worldPosition.y > -2.15 && worldPosition.y < 0.75;

  if (renderZone == 0) {
    return !outsidePoint || door;
  }

  return outsidePoint || (shell && light < 0.12) || door;
}

void main() {
  if (!sceneVisible()) {
    discard;
  }

  pixel = vec4(shade + shade * light * 2.2, 1.0);
}
`

export const fragment = `#version 300 es
precision highp float;

uniform float time;
uniform vec3 cameraEye;
uniform int renderZone;
uniform sampler2D treeShadowMap;

in vec3 shade;
in float light;
in vec2 patternUv;
in float hazeAmount;
in vec3 worldPosition;
flat in float strobeId;

out vec4 pixel;

bool sceneVisible() {
  bool outsidePoint = worldPosition.x < -7.05 || worldPosition.x > 7.05 || worldPosition.z < -24.05 || worldPosition.z > 4.05;
  bool shell = (
    abs(worldPosition.z - 4.0) < 0.18
    || abs(worldPosition.z + 24.0) < 0.18
    || abs(worldPosition.x - 7.0) < 0.18
    || abs(worldPosition.x + 7.0) < 0.18
  ) && worldPosition.y > -2.15 && worldPosition.y < 5.15;
  bool door = abs(worldPosition.z - 4.0) < 0.22
    && worldPosition.x > -5.75 && worldPosition.x < -3.75
    && worldPosition.y > -2.15 && worldPosition.y < 0.75;

  if (renderZone == 0) {
    return !outsidePoint || door;
  }

  return outsidePoint || (shell && light < 0.12) || door;
}

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 curve = local * local * (3.0 - 2.0 * local);
  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));

  return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
}

vec3 grassColor() {
  vec2 field = worldPosition.xz * 0.11;
  vec2 shadowUv = vec2(
    (worldPosition.x + 72.0) / 144.0,
    (worldPosition.z + 84.0) / 172.0
  );
  float cameraDistance = length(worldPosition.xz - cameraEye.xz);
  float detail = noise(worldPosition.xz * 2.6) * 0.10 + noise(worldPosition.xz * 0.55) * 0.16;
  float band = sin(field.x * 2.7 + noise(field * 2.0) * 2.4) * 0.5 + 0.5;
  float hill = smoothstep(0.22, 0.92, noise(field + vec2(4.0, 9.0)) * 0.7 + band * 0.3);
  float far = smoothstep(10.0, 55.0, cameraDistance);
  float horizon = smoothstep(34.0, 60.0, cameraDistance);
  float shadow = texture(treeShadowMap, shadowUv).a;
  vec3 closeGrass = shade * (0.82 + detail);
  vec3 distantGrass = mix(vec3(${outsideMotif === 'night' ? '0.008, 0.055, 0.025' : '0.035, 0.20, 0.055'}), vec3(${
  outsideMotif === 'night' ? '0.025, 0.13, 0.055' : '0.08, 0.34, 0.095'
}), hill);
  vec3 hillGrass = mix(vec3(${outsideMotif === 'night' ? '0.004, 0.035, 0.018' : '0.018, 0.12, 0.035'}), vec3(${
  outsideMotif === 'night' ? '0.018, 0.095, 0.04' : '0.065, 0.25, 0.06'
}), hill);
  vec3 grass = mix(mix(closeGrass, distantGrass, far), hillGrass, horizon * 0.55);

  return grass * ${outsideMotif === 'night' ? '0.45' : '1.0'} * mix(1.0, ${
  outsideMotif === 'night' ? '1.0' : '0.25'
}, shadow);
}

void main() {
  if (!sceneVisible()) {
    discard;
  }

  float white = step(0.3, min(shade.r, min(shade.g, shade.b)));
  float random = fract(sin(strobeId * 17.13 + time * 9.27) * 43758.5453);
  float strobe = mix(1.0, step(0.82, random), white);
  float receiverShadow = texture(treeShadowMap, patternUv).a;

  if (hazeAmount > 4.5) {
    if (receiverShadow < 0.01) {
      discard;
    }

    pixel = vec4(vec3(0.002, 0.018, 0.004), receiverShadow * 0.42);
    return;
  }

  vec3 base = hazeAmount > 1.5 ? grassColor() : shade;
  vec3 emissive = shade * light * 2.2 * strobe;
  float alpha = hazeAmount > 3.5 ? 0.34 : 1.0;

  pixel = vec4(base + emissive, alpha);
}
`

export const lightFragment = `#version 300 es
precision highp float;

uniform float time;
uniform sampler2D smokeMap;
uniform int renderZone;

in vec3 shade;
in float light;
in vec2 patternUv;
in float hazeAmount;
in vec3 worldPosition;
flat in float strobeId;

out vec4 pixel;

bool sceneVisible() {
  bool outsidePoint = worldPosition.x < -7.05 || worldPosition.x > 7.05 || worldPosition.z < -24.05 || worldPosition.z > 4.05;
  bool door = abs(worldPosition.z - 4.0) < 0.22
    && worldPosition.x > -5.75 && worldPosition.x < -3.75
    && worldPosition.y > -2.15 && worldPosition.y < 0.75;

  return renderZone == 0 ? (!outsidePoint || door) : (outsidePoint || door);
}

float smokeDensity(vec2 uv) {
  vec2 drift = vec2(strobeId * 0.173, time * 0.0018);
  float cloud = texture(smokeMap, uv * vec2(1.0, 1.75) + drift).r;
  float detail = texture(smokeMap, uv * vec2(2.7, 4.8) + drift * 0.37 + vec2(0.31, 0.17)).r;
  float smoke = smoothstep(0.28, 0.74, cloud * 0.78 + detail * 0.22);
  float body = smoothstep(0.03, 0.18, uv.y) * (1.0 - smoothstep(0.94, 1.0, uv.y));

  return (0.26 + smoke * 0.9) * body;
}

void main() {
  if (!sceneVisible()) {
    discard;
  }

  float white = step(0.3, min(shade.r, min(shade.g, shade.b)));
  float red = step(0.45, shade.r) * (1.0 - step(0.14, shade.g)) * (1.0 - step(0.1, shade.b));
  float random = fract(sin(strobeId * 17.13 + time * 9.27) * 43758.5453);
  float redRandom = fract(sin(strobeId * 31.7 + floor(time / 90.0) * 13.11) * 43758.5453);
  float redControlled = red * step(0.5, strobeId);
  float redGate = step(0.28, redRandom);
  float beam = step(0.5, hazeAmount);
  float beamGate = step(0.56, random);
  float strobe = mix(1.0, step(0.82, random), white) * mix(1.0, redGate, redControlled) * mix(1.0, beamGate, beam);
  float density = 1.0;

  if (hazeAmount > 0.5) {
    density = smokeDensity(patternUv);
  }

  pixel = vec4(shade + shade * light * 2.2 * strobe * density, clamp(light * strobe * density, 0.0, 1.0));
}
`

export const hairVertex = `#version 300 es
precision highp float;

layout(location = 0) in vec3 localPosition;
layout(location = 1) in vec3 instanceCenter;
layout(location = 2) in vec3 instanceSide;
layout(location = 3) in vec3 instanceUp;
layout(location = 4) in vec3 instanceForward;
layout(location = 5) in vec3 instanceColor;

uniform vec2 resolution;
uniform vec3 cameraEye;
uniform vec3 cameraCenter;

out vec3 shade;
out vec3 worldPosition;

mat4 perspective(float fov, float aspect, float near, float far) {
  float f = 1.0 / tan(fov * 0.5);

  return mat4(
    f / aspect, 0.0, 0.0, 0.0,
    0.0, f, 0.0, 0.0,
    0.0, 0.0, (far + near) / (near - far), -1.0,
    0.0, 0.0, (2.0 * far * near) / (near - far), 0.0
  );
}

mat4 lookAt(vec3 eye, vec3 center, vec3 up) {
  vec3 z = normalize(eye - center);
  vec3 x = normalize(cross(up, z));
  vec3 y = cross(z, x);

  return mat4(
    x.x, y.x, z.x, 0.0,
    x.y, y.y, z.y, 0.0,
    x.z, y.z, z.z, 0.0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1.0
  );
}

void main() {
  vec3 position = instanceCenter
    + instanceSide * localPosition.x
    + instanceUp * localPosition.y
    + instanceForward * localPosition.z;
  mat4 camera = lookAt(cameraEye, cameraCenter, vec3(0.0, 1.0, 0.0));
  mat4 projection = perspective(1.08, resolution.x / resolution.y, 0.1, 180.0);

  gl_Position = projection * camera * vec4(position, 1.0);
  shade = instanceColor;
  worldPosition = position;
}
`

export const hairFragment = `#version 300 es
precision highp float;

uniform int renderZone;

in vec3 shade;
in vec3 worldPosition;

out vec4 pixel;

bool sceneVisible() {
  bool outsidePoint = worldPosition.x < -7.05 || worldPosition.x > 7.05 || worldPosition.z < -24.05 || worldPosition.z > 4.05;
  bool door = abs(worldPosition.z - 4.0) < 0.22
    && worldPosition.x > -5.75 && worldPosition.x < -3.75
    && worldPosition.y > -2.15 && worldPosition.y < 0.75;

  return renderZone == 0 ? (!outsidePoint || door) : (outsidePoint || door);
}

void main() {
  if (!sceneVisible()) {
    discard;
  }

  pixel = vec4(shade, 1.0);
}
`

export const strobeVertex = `#version 300 es
precision highp float;

layout(location = 0) in vec4 local;
layout(location = 1) in vec4 paint;
layout(location = 2) in vec3 instanceTop;
layout(location = 3) in vec3 instanceHit;
layout(location = 4) in vec3 instanceBeamRadius;
layout(location = 5) in vec3 instanceColor;
layout(location = 6) in vec2 instanceMeta;

uniform vec2 resolution;
uniform vec3 cameraEye;
uniform vec3 cameraCenter;

out vec3 shade;
out float light;
out vec2 patternUv;
out float hazeAmount;
out vec3 worldPosition;
flat out float strobeId;

mat4 perspective(float fov, float aspect, float near, float far) {
  float f = 1.0 / tan(fov * 0.5);

  return mat4(
    f / aspect, 0.0, 0.0, 0.0,
    0.0, f, 0.0, 0.0,
    0.0, 0.0, (far + near) / (near - far), -1.0,
    0.0, 0.0, (2.0 * far * near) / (near - far), 0.0
  );
}

mat4 lookAt(vec3 eye, vec3 center, vec3 up) {
  vec3 z = normalize(eye - center);
  vec3 x = normalize(cross(up, z));
  vec3 y = cross(z, x);

  return mat4(
    x.x, y.x, z.x, 0.0,
    x.y, y.y, z.y, 0.0,
    x.z, y.z, z.z, 0.0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1.0
  );
}

void main() {
  float pool = step(0.5, local.w);
  vec3 beamTop = instanceTop + vec3(local.x * instanceBeamRadius.x, 0.0, local.y * instanceBeamRadius.x);
  vec3 beamBottom = instanceHit + vec3(local.x * instanceBeamRadius.y, 0.0, local.y * instanceBeamRadius.z);
  vec3 beamPosition = mix(beamTop, beamBottom, local.z);
  vec3 poolPosition = instanceHit + vec3(local.x, 0.02, local.y);
  vec3 position = mix(beamPosition, poolPosition, pool);
  float glow = mix(instanceMeta.y * paint.z, paint.z, pool);
  mat4 camera = lookAt(cameraEye, cameraCenter, vec3(0.0, 1.0, 0.0));
  mat4 projection = perspective(1.08, resolution.x / resolution.y, 0.1, 180.0);
  vec4 view = camera * vec4(position, 1.0);

  gl_Position = projection * view;
  shade = instanceColor;
  light = glow;
  patternUv = paint.xy;
  hazeAmount = paint.w;
  worldPosition = position;
  strobeId = instanceMeta.x;
}
`

export const smokeVertex = `#version 300 es
precision highp float;

layout(location = 0) in vec3 center;
layout(location = 1) in vec3 offset;
layout(location = 3) in float seed;
layout(location = 4) in vec2 pattern;

uniform float time;
uniform vec2 resolution;
uniform vec3 cameraEye;
uniform vec3 cameraCenter;

out vec2 patternUv;
out vec2 localUv;
out float opacity;
out float patchSeed;

mat4 perspective(float fov, float aspect, float near, float far) {
  float f = 1.0 / tan(fov * 0.5);

  return mat4(
    f / aspect, 0.0, 0.0, 0.0,
    0.0, f, 0.0, 0.0,
    0.0, 0.0, (far + near) / (near - far), -1.0,
    0.0, 0.0, (2.0 * far * near) / (near - far), 0.0
  );
}

mat4 lookAt(vec3 eye, vec3 center, vec3 up) {
  vec3 z = normalize(eye - center);
  vec3 x = normalize(cross(up, z));
  vec3 y = cross(z, x);

  return mat4(
    x.x, y.x, z.x, 0.0,
    x.y, y.y, z.y, 0.0,
    x.z, y.z, z.z, 0.0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1.0
  );
}

void main() {
  vec3 viewForward = normalize(cameraCenter - cameraEye);
  vec3 right = normalize(cross(viewForward, vec3(0.0, 1.0, 0.0)));
  vec3 up = normalize(cross(right, viewForward));
  float cycle = fract(time * 0.018 + seed * 0.137 + center.y * 0.19);
  float fade = smoothstep(0.0, 0.18, cycle) * (1.0 - smoothstep(0.78, 1.0, cycle));
  vec2 drift = vec2(sin(seed * 2.41), cos(seed * 3.17));
  vec3 place = center;

  place.y = -1.45 + pow(cycle, 1.45) * 4.8;
  place.x += drift.x * (cycle - 0.5) * 1.45 + sin(time * 0.11 + seed * 6.1) * 0.22;
  place.z += drift.y * (cycle - 0.5) * 1.9 + cos(time * 0.09 + seed * 4.7) * 0.28;

  mat4 camera = lookAt(cameraEye, cameraCenter, vec3(0.0, 1.0, 0.0));
  mat4 projection = perspective(1.08, resolution.x / resolution.y, 0.1, 180.0);
  vec3 position = place + right * offset.x + up * offset.y;

  gl_Position = projection * camera * vec4(position, 1.0);
  localUv = pattern;
  patternUv = pattern + vec2(seed * 0.071 + time * 0.012, time * 0.026);
  opacity = offset.z * fade;
  patchSeed = seed;
}
`

export const smokeFragment = `#version 300 es
precision highp float;

uniform float time;
uniform sampler2D smokeMap;

in vec2 patternUv;
in vec2 localUv;
in float opacity;
in float patchSeed;

out vec4 pixel;

void main() {
  float swirl = time * 0.42 + patchSeed * 1.71;
  vec2 local = localUv - 0.5;
  vec2 warp = vec2(
    sin(local.y * 9.0 + swirl) * 0.11 + sin(local.x * 5.0 - swirl * 0.7) * 0.06,
    cos(local.x * 8.0 - swirl * 0.83) * 0.1 + sin(local.y * 6.0 + swirl * 0.51) * 0.06
  );
  vec2 uv = patternUv + warp;
  float edgeNoise = texture(smokeMap, uv * vec2(1.9, 1.3) + vec2(time * 0.018, patchSeed * 0.013)).r;
  float radius = 0.38 + (edgeNoise - 0.5) * 0.18;
  float edge = 1.0 - smoothstep(radius * 0.55, radius, length(local + warp * 0.32));
  float cloudA = texture(smokeMap, uv * vec2(1.5, 1.1)).r;
  float cloudB = texture(smokeMap, uv * vec2(3.6, 2.4) + vec2(patchSeed * 0.037, -time * 0.031)).r;
  float cloud = cloudA * 0.7 + cloudB * 0.3;
  float body = (0.22 + smoothstep(0.16, 0.72, cloud) * 0.78) * edge;
  float alpha = body * opacity;

  pixel = vec4(vec3(0.58, 0.55, 0.5), alpha);
}
`

export const postVertex = `#version 300 es
precision highp float;

layout(location = 0) in vec2 position;

out vec2 uv;

void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

export const postFragment = `#version 300 es
precision highp float;

uniform sampler2D scene;
uniform sampler2D bloom;
uniform vec2 bloomResolution;
uniform vec3 skyForward;
uniform vec3 skyRight;
uniform vec3 skyUp;

in vec2 uv;

out vec4 pixel;

vec3 bright(vec4 texel) {
  float redGlow = texel.a * smoothstep(0.58, 1.0, texel.r);
  float blueGlow = texel.a * smoothstep(0.045, 0.24, texel.b) * step(texel.r * 1.4, texel.b);

  return redGlow * vec3(1.0, 0.035, 0.012) + blueGlow * vec3(0.0, 0.067, 1.0);
}

vec3 afternoonSky(vec2 point) {
  vec3 horizon = vec3(0.96, 0.36, 0.2);
  vec3 peach = vec3(0.9, 0.54, 0.34);
  vec3 blue = vec3(0.28, 0.52, 0.86);
  float lift = smoothstep(0.28, 0.92, point.y);
  float warmth = 1.0 - smoothstep(0.18, 0.55, point.y);

  return mix(mix(peach, blue, lift), horizon, warmth * 0.72);
}

vec3 hashStar(vec2 cell) {
  vec3 value = fract(vec3(cell.xyx) * vec3(0.1031, 0.103, 0.0973));
  value += dot(value, value.yzx + 33.33);

  return fract((value.xxy + value.yzz) * value.zyx);
}

vec3 nightSky(vec2 point) {
  float starCell = 210.0;
  vec2 cell = floor(point * vec2(starCell, starCell * 0.5));
  vec2 local = fract(point * vec2(starCell, starCell * 0.5)) - 0.5;
  vec3 seed = hashStar(cell);
  float size = seed.y * seed.y * seed.y * seed.y;
  float radius = mix(0.035, 0.16, size);
  float star = step(0.972, seed.x) * smoothstep(radius, 0.0, length(local));
  vec3 blue = vec3(0.55, 0.68, 1.0);
  vec3 red = vec3(1.0, 0.58, 0.52);
  vec3 yellow = vec3(1.0, 0.9, 0.52);
  vec3 white = vec3(0.95, 0.97, 1.0);
  vec3 starColor = seed.z < 0.25 ? blue : seed.z < 0.5 ? red : seed.z < 0.75 ? yellow : white;
  vec3 low = vec3(0.015, 0.01, 0.035);
  vec3 high = vec3(0.0, 0.0, 0.012);
  vec2 moonDelta = vec2(abs(fract(point.x - 0.55 + 0.5) - 0.5), point.y - 0.62);
  float moonDistance = length(moonDelta * vec2(1.0, .5));
  float moon = smoothstep(0.008, 0.006, moonDistance);
  float moonGlow = smoothstep(0.03, 0.008, moonDistance) * 0.18;
  vec3 sky = mix(low, high, smoothstep(0.0, 1.0, point.y));
  vec3 moonColor = vec3(0.94, 0.92, 0.82);

  return sky + starColor * star + moonColor * moonGlow + moonColor * moon;
}

vec2 skyPoint(vec2 point) {
  vec2 screen = point * 2.0 - 1.0;
  float aspect = bloomResolution.x / bloomResolution.y;
  vec3 direction = normalize(skyForward + skyRight * screen.x * aspect + skyUp * screen.y);

  return vec2(atan(direction.x, direction.z) / 6.2831853 + 0.5, asin(direction.y) / 3.14159265 + 0.5);
}

void main() {
  vec4 source = texture(scene, uv);
  vec3 base = source.rgb;
  float sky = 1.0 - smoothstep(0.02, 0.12, distance(base, vec3(0.28, 0.55, 0.92)));
  vec2 texel = 1.0 / bloomResolution;
  vec2 near = texel * 3.2;
  vec2 far = texel * 7.0;
  vec3 glow = bright(texture(bloom, uv)) * 0.72;

  if (sky > 0.0) {
    vec2 skyUv = skyPoint(uv);

    base = mix(base, ${outsideMotif === 'night' ? 'nightSky(skyUv)' : 'afternoonSky(skyUv)'}, sky);
  }

  glow += bright(texture(bloom, uv + vec2(near.x, 0.0))) * 0.18;
  glow += bright(texture(bloom, uv - vec2(near.x, 0.0))) * 0.18;
  glow += bright(texture(bloom, uv + vec2(0.0, near.y))) * 0.15;
  glow += bright(texture(bloom, uv - vec2(0.0, near.y))) * 0.15;
  glow += bright(texture(bloom, uv + vec2(far.x, 0.0))) * 0.09;
  glow += bright(texture(bloom, uv - vec2(far.x, 0.0))) * 0.09;
  glow += bright(texture(bloom, uv + vec2(0.0, far.y))) * 0.07;
  glow += bright(texture(bloom, uv - vec2(0.0, far.y))) * 0.07;

  vec3 color = base + glow * 4.4;
  color = vec3(1.0) - exp(-color * 1.05);
  color *= vec3(1.02, 0.98, 0.96);

  pixel = vec4(pow(color, vec3(0.9)), 1.0);
}
`
