"use client";

import dynamic from "next/dynamic";

const Hero3D = dynamic(() => import("./hero-3d"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] w-[300px] md:h-[400px] md:w-[400px] lg:h-[500px] lg:w-[500px] flex-shrink-0 animate-pulse bg-muted rounded-full" />
  ),
});

export function HeroWrapper() {
  return <Hero3D />;
}
