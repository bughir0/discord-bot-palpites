"use client";

export function SiteBackground() {
  return (
    <div className="site-bg" aria-hidden="true">
      <div className="site-bg-base" />
      <div className="site-bg-aurora site-bg-aurora-a" />
      <div className="site-bg-aurora site-bg-aurora-b" />
      <div className="site-bg-aurora site-bg-aurora-c" />
      <div className="site-bg-vignette" />
      <div className="site-bg-grid" />
      <div className="site-bg-beam" />
      <div className="site-bg-particles">
        {PARTICLES.map((p) => (
          <span
            key={p.id}
            className="site-bg-particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              opacity: p.opacity,
              width: p.size,
              height: p.size,
            }}
          />
        ))}
      </div>
    </div>
  );
}

const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  x: (i * 17 + 7) % 100,
  y: (i * 23 + 11) % 100,
  delay: (i % 7) * 0.8,
  duration: 4 + (i % 5),
  opacity: 0.15 + (i % 4) * 0.08,
  size: 2 + (i % 3),
}));
