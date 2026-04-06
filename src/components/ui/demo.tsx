'use client';

import { SparklesCore } from '@/components/ui/sparkles';

export function SparklesPreview() {
  return (
    <div className="h-[40rem] w-full overflow-hidden rounded-md bg-black flex flex-col items-center justify-center">
      <h1 className="relative z-20 text-center text-3xl font-bold text-white md:text-7xl lg:text-9xl">
        Acme
      </h1>
      <div className="relative h-40 w-[40rem]">
        <div className="absolute inset-x-20 top-0 h-[2px] w-3/4 bg-gradient-to-r from-transparent via-indigo-500 to-transparent blur-sm" />
        <div className="absolute inset-x-20 top-0 h-px w-3/4 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
        <div className="absolute inset-x-60 top-0 h-[5px] w-1/4 bg-gradient-to-r from-transparent via-sky-500 to-transparent blur-sm" />
        <div className="absolute inset-x-60 top-0 h-px w-1/4 bg-gradient-to-r from-transparent via-sky-500 to-transparent" />

        <SparklesCore
          background="transparent"
          minSize={0.4}
          maxSize={1}
          particleDensity={1200}
          className="h-full w-full"
          particleColor="#FFFFFF"
        />

        <div className="absolute inset-0 h-full w-full bg-black [mask-image:radial-gradient(350px_200px_at_top,transparent_20%,white)]" />
      </div>
    </div>
  );
}

export function SparklesPreviewDark() {
  return (
    <div className="relative h-[40rem] w-full overflow-hidden rounded-md bg-slate-950 flex flex-col items-center justify-center">
      <div className="absolute inset-0 h-screen w-full">
        <SparklesCore
          id="tsparticlesfullpage"
          background="transparent"
          minSize={0.6}
          maxSize={1.4}
          particleDensity={100}
          className="h-full w-full"
          particleColor="#FFFFFF"
          speed={1}
        />
      </div>
      <h1 className="relative z-20 text-center text-3xl font-bold text-white md:text-7xl lg:text-9xl">
        Build faster
      </h1>
    </div>
  );
}

export function SparklesPreviewColorful() {
  return (
    <div className="relative h-[40rem] w-full overflow-hidden rounded-md bg-black flex flex-col items-center justify-center">
      <div className="absolute inset-0 h-screen w-full">
        <SparklesCore
          id="tsparticlescolorful"
          background="transparent"
          minSize={0.6}
          maxSize={1.4}
          particleDensity={100}
          className="h-full w-full"
          particleColor="#00ff00"
          speed={0.5}
        />
      </div>
      <div className="relative z-20 flex flex-col items-center justify-center gap-4">
        <h1 className="bg-gradient-to-b from-neutral-50 to-neutral-400 bg-clip-text text-center text-3xl font-bold text-transparent md:text-7xl lg:text-9xl">
          The Future
        </h1>
        <p className="cursor-default text-center text-neutral-300">is brighter than you think</p>
      </div>
    </div>
  );
}
