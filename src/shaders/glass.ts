export const glassVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  varying float vFresnel;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);

    float cosTheta = abs(dot(vNormal, vViewDir));
    // Schlick's approximation for Fresnel
    float f0 = 0.04;
    vFresnel = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const glassFragmentShader = `
  uniform vec3 uTint;
  uniform float uOpacity;
  uniform float uRimPower;
  uniform vec3 uRimColor;
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  varying float vFresnel;

  void main() {
    // Base glass color with slight tint
    vec3 baseColor = uTint;

    // Fresnel-driven opacity: more transparent face-on, more reflective at edges
    float alpha = mix(uOpacity * 0.3, uOpacity * 1.5, vFresnel);
    alpha = clamp(alpha, 0.02, 0.55);

    // Rim highlight
    float rim = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), uRimPower);
    vec3 rimContribution = uRimColor * rim * 0.6;

    // Subtle specular highlight
    vec3 lightDir = normalize(vec3(1.0, 1.5, 0.8));
    vec3 halfVec = normalize(vViewDir + lightDir);
    float spec = pow(max(dot(vNormal, halfVec), 0.0), 64.0);
    vec3 specContribution = vec3(1.0, 0.98, 0.95) * spec * 0.4;

    // Subtle condensation pattern (animated)
    float condensation = sin(vWorldPos.y * 8.0 + uTime * 0.3) *
                         sin(vWorldPos.x * 5.0 + vWorldPos.z * 5.0 + uTime * 0.2);
    condensation = smoothstep(0.6, 0.9, condensation) * 0.08;

    vec3 finalColor = baseColor + rimContribution + specContribution;
    float finalAlpha = alpha + condensation;

    gl_FragColor = vec4(finalColor, clamp(finalAlpha, 0.0, 0.6));
  }
`;
