precision mediump float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uIntensity;
uniform vec3 uColor;

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  float d = distance(vTextureCoord, vec2(0.5));
  // Assombrit toujours légèrement les bords ; uIntensity ajoute la teinte de danger.
  float base = smoothstep(0.35, 0.85, d);
  color.rgb *= 1.0 - base * 0.45;
  color.rgb = mix(color.rgb, uColor, base * uIntensity);
  finalColor = color;
}
