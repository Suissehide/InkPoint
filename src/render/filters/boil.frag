precision mediump float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uPhase;
uniform float uAmount;

// Bruit de valeur : suffisant pour un frémissement, et sans texture à charger.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main(void) {
  // uPhase est un entier qui change 8 fois par seconde : le déplacement saute
  // d'une valeur à l'autre au lieu de glisser, ce qui donne le « boil » de
  // l'animation traditionnelle plutôt qu'une ondulation.
  vec2 seed = vTextureCoord * 90.0 + uPhase * 37.0;
  vec2 offset = vec2(noise(seed), noise(seed + 41.7)) - 0.5;
  finalColor = texture(uTexture, vTextureCoord + offset * uAmount);
}
