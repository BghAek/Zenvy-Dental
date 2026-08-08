"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sphere, MeshDistortMaterial } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";
import { useReducedMotion } from "framer-motion";

function AbstractShape() {
  const meshRef = useRef<THREE.Mesh>(null);
  const shouldReduceMotion = useReducedMotion();
  
  useFrame((state) => {
    if (meshRef.current && !shouldReduceMotion) {
      meshRef.current.rotation.x = state.clock.getElapsedTime() * 0.2;
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    }
  });

  if (shouldReduceMotion) {
    return (
      <Sphere ref={meshRef} args={[1, 64, 64]} scale={1.2}>
        <meshStandardMaterial color="#1E293B" roughness={0.2} metalness={0.1} />
      </Sphere>
    );
  }

  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={2}>
      <Sphere ref={meshRef} args={[1, 64, 64]} scale={1.2}>
        <MeshDistortMaterial
          color="#1E293B"
          attach="material"
          distort={0.4}
          speed={1.5}
          roughness={0.2}
          metalness={0.1}
        />
      </Sphere>
    </Float>
  );
}

export default function Hero3D() {
  return (
    <div className="h-[300px] w-[300px] md:h-[400px] md:w-[400px] lg:h-[500px] lg:w-[500px] flex-shrink-0" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[10, 10, 5]} intensity={2.5} color="#FFFFFF" />
        <directionalLight position={[-10, -10, -5]} intensity={1} color="#E2E8F0" />
        <AbstractShape />
      </Canvas>
    </div>
  );
}
