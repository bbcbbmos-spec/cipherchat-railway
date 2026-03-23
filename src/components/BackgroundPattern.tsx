import React, { useEffect, useRef } from 'react';

interface BackgroundPatternProps {
  primaryColor: string; // e.g., '180, 130, 70'
  opacity?: number;
}

export default function BackgroundPattern({ primaryColor, opacity = 0.25 }: BackgroundPatternProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let t = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = parent.offsetWidth * dpr;
        canvas.height = parent.offsetHeight * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = `${parent.offsetWidth}px`;
        canvas.style.height = `${parent.offsetHeight}px`;
      }
    };

    window.addEventListener('resize', resize);
    resize();

    const OAK = `rgba(${primaryColor},`;
    const WHITE = 'rgba(255,255,255,';

    // 1. Dot Grid
    const drawDotGrid = (w: number, h: number) => {
      const spacing = 32;
      const rows = Math.ceil(h / spacing) + 1;
      const cols = Math.ceil(w / spacing) + 1;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * spacing + (r % 2) * (spacing / 2);
          const y = r * spacing;
          const dist = Math.sqrt((x - w / 2) ** 2 + (y - h / 2) ** 2);
          const maxDist = Math.sqrt((w / 2) ** 2 + (h / 2) ** 2);
          const alpha = 0.4 * (1 - dist / maxDist) * opacity;

          ctx.beginPath();
          ctx.arc(x, y, 0.8, 0, Math.PI * 2);
          ctx.fillStyle = OAK + alpha + ')';
          ctx.fill();
        }
      }
    };

    // 2. Symbols
    const chars = ['0', '1', 'A', 'F', 'B', 'E', '3', '7', '⌘', '◈', '⊕', '⊗', '⟨', '⟩', '∅', '≡'];
    const isMobile = window.innerWidth < 768;
    const SYMBOL_COUNT = isMobile ? 40 : 80;
    const symbols = Array.from({ length: SYMBOL_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      char: chars[Math.floor(Math.random() * chars.length)],
      size: (isMobile ? 8 : 11) + Math.random() * 6,
      alpha: 0.08 + Math.random() * 0.12,
      speed: 0.06 + Math.random() * 0.1,
      phase: Math.random() * Math.PI * 2,
    }));

    // 3. Nodes
    const NODE_COUNT = isMobile ? 10 : 20;
    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0004,
      vy: (Math.random() - 0.5) * 0.0004,
      r: 1 + Math.random() * 1.5,
    }));

    // 4. Locks
    const drawLock = (cx: number, cy: number, size: number, alpha: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = OAK + '1)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.arc(0, -size * 0.3, size * 0.4, Math.PI, 0);
      ctx.stroke();

      const w = size * 0.7, h = size * 0.55;
      ctx.strokeRect(-w / 2, -size * 0.1, w, h);

      ctx.beginPath();
      ctx.arc(0, size * 0.2, size * 0.1, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    };

    const lockConfigs = [
      { rx: 0.15, ry: 0.2, s: 16, a: 0.15 },
      { rx: 0.82, ry: 0.15, s: 12, a: 0.12 },
      { rx: 0.08, ry: 0.72, s: 14, a: 0.14 },
      { rx: 0.88, ry: 0.78, s: 18, a: 0.15 },
      { rx: 0.5, ry: 0.12, s: 11, a: 0.1 },
      { rx: 0.92, ry: 0.45, s: 13, a: 0.12 },
      { rx: 0.25, ry: 0.88, s: 15, a: 0.13 },
    ];

    // 5. Hexagons
    const hexPath = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    const hexConfigs = [
      { rx: 0.1, ry: 0.45, r: 24, a: 0.08 },
      { rx: 0.9, ry: 0.38, r: 20, a: 0.07 },
      { rx: 0.5, ry: 0.88, r: 22, a: 0.08 },
      { rx: 0.22, ry: 0.85, r: 17, a: 0.06 },
      { rx: 0.78, ry: 0.88, r: 19, a: 0.07 },
      { rx: 0.5, ry: 0.08, r: 16, a: 0.06 },
      { rx: 0.12, ry: 0.12, r: 15, a: 0.05 },
    ];

    const draw = () => {
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      drawDotGrid(w, h);

      hexConfigs.forEach(hex => {
        const cx = hex.rx * w;
        const cy = hex.ry * h;
        hexPath(cx, cy, hex.r);
        ctx.strokeStyle = OAK + (hex.a * 2.5 * opacity) + ')';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        hexPath(cx, cy, hex.r * 0.6);
        ctx.strokeStyle = OAK + (hex.a * 1.5 * opacity) + ')';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      });

      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i];
          const n2 = nodes[j];
          const dx = (n1.x - n2.x) * w;
          const dy = (n1.y - n2.y) * h;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 200) {
            const a = (1 - d / 200) * 0.4 * opacity;
            ctx.strokeStyle = OAK + a + ')';
            ctx.beginPath();
            ctx.moveTo(n1.x * w, n1.y * h);
            ctx.lineTo(n2.x * w, n2.y * h);
            ctx.stroke();
          }
        }
      }

      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > 1) n.vx *= -1;
        if (n.y < 0 || n.y > 1) n.vy *= -1;

        ctx.beginPath();
        ctx.arc(n.x * w, n.y * h, n.r, 0, Math.PI * 2);
        ctx.fillStyle = OAK + (0.6 * opacity) + ')';
        ctx.fill();
      });

      ctx.textAlign = 'center';
      symbols.forEach(s => {
        const drift = Math.sin(t * s.speed + s.phase) * 4;
        const a = s.alpha * (0.8 + 0.2 * Math.sin(t * s.speed * 0.7 + s.phase)) * opacity;
        ctx.font = `${s.size}px monospace`;
        ctx.shadowBlur = 5;
        ctx.shadowColor = WHITE + (a * 0.3) + ')';
        ctx.fillStyle = WHITE + a + ')';
        ctx.fillText(s.char, s.x * w, s.y * h + drift);
        ctx.shadowBlur = 0;
      });

      lockConfigs.forEach(l => {
        const pulse = 0.6 + 0.4 * Math.sin(t * 0.4 + l.rx * 10);
        drawLock(l.rx * w, l.ry * h, l.s, l.a * 2.5 * pulse * opacity);
      });

      const centerRadius = isMobile ? 30 : 50;
      const circleCount = isMobile ? 4 : 6;
      for (let i = 0; i < circleCount; i++) {
        const phase = (t * 0.25 + i * 0.8) % (Math.PI * 2);
        const radius = centerRadius + i * (isMobile ? 30 : 45) + Math.sin(phase) * 10;
        const alpha = 0.35 * (1 - (i / circleCount)) * opacity;
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
        ctx.strokeStyle = OAK + alpha + ')';
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 20;
        ctx.shadowColor = OAK + (alpha * 0.7) + ')';
        ctx.stroke();
        ctx.restore();
        
        // Add some "radar" dashes
        if (i % 2 === 0) {
          ctx.save();
          ctx.setLineDash([15, 25]);
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, radius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = OAK + (alpha * 0.6) + ')';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      t += 0.02;
      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [primaryColor]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
      <div 
        className="absolute inset-0" 
        style={{ 
          background: `radial-gradient(ellipse 85% 85% at 50% 50%, transparent 50%, var(--app-bg) 100%)` 
        }} 
      />
      <div className="absolute bottom-10 md:bottom-20 left-1/2 -translate-x-1/2 font-mono text-[8px] md:text-[10px] uppercase tracking-[0.2em] text-app-primary/20 whitespace-nowrap">
        end-to-end encrypted
      </div>
    </div>
  );
}
