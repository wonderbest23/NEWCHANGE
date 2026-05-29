export const waterVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const waterFragmentShader = `
  precision mediump float;

  varying vec2 vUv;

  uniform float uTime;
  uniform float uPhaseStrength;
  uniform float uRippleStrength;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;

    vec2 ep = vec2(p.x * 1.45, p.y * 0.95);
    float dist = length(ep);

    float mask = 1.0 - smoothstep(0.68, 1.0, dist);

    float r1 = sin(dist * 42.0 - uTime * 4.2);
    float r2 = sin(dist * 24.0 + uTime * 2.1);
    float r3 = sin((p.x + p.y) * 18.0 + uTime * 1.4);

    float ripple = (r1 * 0.08 + r2 * 0.045 + r3 * 0.025) * uRippleStrength;

    float centerGlow = 1.0 - smoothstep(0.0, 0.38, dist);
    centerGlow *= 0.28 * uPhaseStrength;

    float ring = abs(sin(dist * 36.0 - uTime * 5.0));
    ring = smoothstep(0.82, 1.0, ring) * 0.18 * uRippleStrength;

    vec3 color = mix(uColorA, uColorB, dist + ripple);
    color += vec3(0.45, 0.85, 1.0) * centerGlow;
    color += vec3(0.7, 0.95, 1.0) * ring;

    float alpha = mask * uOpacity;
    alpha *= 0.72 + ripple;
    alpha += ring * mask;

    gl_FragColor = vec4(color, alpha);
  }
`;
