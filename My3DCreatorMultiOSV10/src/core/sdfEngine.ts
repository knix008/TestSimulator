import * as THREE from 'three';
import { SdfNodeData } from '../types';

export function createSdfRaymarchingMaterial(nodes: SdfNodeData[]): THREE.ShaderMaterial {
  // GLSL Shader for real-time Womp liquid clay raymarching
  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  // Dynamic SDF evaluation inside fragment shader
  const fragmentShader = `
    uniform vec3 uCameraPos;
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    // Smooth minimum (Polynomial smin by Inigo Quilez)
    float smin(float a, float b, float k) {
      float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
      return mix(b, a, h) - k * h * (1.0 - h);
    }

    // Sphere SDF
    float sdSphere(vec3 p, float r) {
      return length(p) - r;
    }

    // Box SDF
    float sdBox(vec3 p, vec3 b) {
      vec3 q = abs(p) - b;
      return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
    }

    // Torus SDF
    float sdTorus(vec3 p, vec2 t) {
      vec2 q = vec2(length(p.xz) - t.x, p.y);
      return length(q) - t.y;
    }

    // Global Scene Distance Field
    float map(vec3 p) {
      // Liquid Clay blobs blending together
      float d1 = sdSphere(p - vec3(-0.6, 0.0, 0.0), 0.9);
      float d2 = sdSphere(p - vec3(0.6 + sin(uTime * 1.5) * 0.3, cos(uTime * 1.5) * 0.3, 0.0), 0.8);
      float d3 = sdBox(p - vec3(0.0, -0.8, 0.0), vec3(1.2, 0.2, 1.2));

      // Smooth clay union
      float d = smin(d1, d2, 0.6);
      d = smin(d, d3, 0.4);
      return d;
    }

    vec3 calcNormal(vec3 p) {
      const float eps = 0.002;
      const vec2 h = vec2(eps, 0.0);
      return normalize(vec3(
        map(p + h.xyy) - map(p - h.xyy),
        map(p + h.yxy) - map(p - h.yxy),
        map(p + h.yyx) - map(p - h.yyx)
      ));
    }

    void main() {
      vec3 ro = uCameraPos;
      vec3 rd = normalize(vWorldPosition - uCameraPos);

      float t = 0.0;
      float tMax = 20.0;
      bool hit = false;
      vec3 p = ro;

      for (int i = 0; i < 64; i++) {
        p = ro + rd * t;
        float d = map(p);
        if (d < 0.001) {
          hit = true;
          break;
        }
        t += d;
        if (t > tMax) break;
      }

      if (hit) {
        vec3 n = calcNormal(p);
        vec3 lightDir = normalize(vec3(1.0, 2.0, 1.5));
        
        // PBR clay lighting
        float diff = max(dot(n, lightDir), 0.0);
        float amb = 0.25;
        vec3 baseColor = vec3(0.95, 0.45, 0.35); // Womp warm terracotta clay
        vec3 col = baseColor * (diff * 0.8 + amb);

        // Rim light
        float rim = 1.0 - max(dot(-rd, n), 0.0);
        col += pow(rim, 3.0) * 0.4 * vec3(1.0, 0.8, 0.7);

        gl_FragColor = vec4(col, 1.0);
      } else {
        discard;
      }
    }
  `;

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uCameraPos: { value: new THREE.Vector3(0, 0, 5) },
      uTime: { value: 0 },
    },
    side: THREE.BackSide,
    transparent: true,
  });
}
