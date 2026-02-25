"use client";

/**
 * Halide 风格 3D 视差英雄区：鼠标跟随的景深图层 + 颗粒叠加 + 网格 UI
 * 用作首页英雄区背景，children 为叠加在网格上的内容（标题、统计、CTA 等）
 */
import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const LAYER_IMAGES = [
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1200",
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&q=80&w=1200",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&q=80&w=1200",
];

export interface HalideHeroProps {
  children: React.ReactNode;
  className?: string;
}

export function HalideHero({ children, className }: HalideHeroProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const x = (window.innerWidth / 2 - e.pageX) / 25;
      const y = (window.innerHeight / 2 - e.pageY) / 25;
      canvas.style.transform = `rotateX(${55 + y / 2}deg) rotateZ(${-25 + x / 2}deg)`;
      layersRef.current.forEach((layer, index) => {
        if (!layer) return;
        const depth = (index + 1) * 15;
        const moveX = x * (index + 1) * 0.2;
        const moveY = y * (index + 1) * 0.2;
        layer.style.transform = `translateZ(${depth}px) translate(${moveX}px, ${moveY}px)`;
      });
    };

    canvas.style.opacity = "0";
    canvas.style.transform = "rotateX(90deg) rotateZ(0deg) scale(0.8)";
    const timeout = setTimeout(() => {
      canvas.style.transition = "all 2.5s cubic-bezier(0.16, 1, 0.3, 1)";
      canvas.style.opacity = "1";
      canvas.style.transform = "rotateX(55deg) rotateZ(-25deg) scale(1)";
    }, 300);

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <section className={cn("halide-hero-root relative w-full overflow-hidden", className)} aria-label="英雄区">
      {/* SVG 颗粒滤镜 */}
      <svg className="absolute h-0 w-0" aria-hidden>
        <filter id="halide-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves={3} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div className="halide-grain" style={{ filter: "url(#halide-grain)" }} />

      {/* 前景网格：由调用方传入标题、统计、CTA 等 */}
      <div className="halide-interface-grid">{children}</div>

      {/* 3D 视差画布 */}
      <div className="halide-viewport">
        <div className="halide-canvas-3d" ref={canvasRef}>
          {LAYER_IMAGES.map((url, i) => (
            <div
              key={url}
              className="halide-layer"
              style={{ backgroundImage: `url(${url})` }}
              ref={(el) => { layersRef.current[i] = el; }}
            />
          ))}
          <div className="halide-contours" />
        </div>
      </div>

      <div className="halide-scroll-hint" />
    </section>
  );
}
