precision mediump float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uPhase;
uniform float uAmount;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  float g = hash(vTextureCoord * 800.0 + uPhase) - 0.5;
  finalColor = vec4(color.rgb + g * uAmount, color.a);
}
