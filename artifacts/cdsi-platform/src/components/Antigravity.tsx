import { useRef, useEffect } from 'react';

export interface AntigravityProps {
  count?: number;
  magnetRadius?: number;
  ringRadius?: number;
  waveSpeed?: number;
  waveAmplitude?: number;
  particleSize?: number;
  lerpSpeed?: number;
  color?: string;
  autoAnimate?: boolean;
  particleVariance?: number;
  rotationSpeed?: number;
  depthFactor?: number;
  pulseSpeed?: number;
  particleShape?: string;
  fieldStrength?: number;
}

interface Particle {
  t: number;
  speed: number;
  mx: number;
  my: number;
  cx: number;
  cy: number;
  radiusOffset: number;
}

export default function Antigravity({
  count = 200,
  magnetRadius = 120,
  ringRadius = 90,
  waveSpeed = 0.4,
  waveAmplitude = 1.2,
  particleSize = 2.5,
  lerpSpeed = 0.08,
  color = '#10b981',
  autoAnimate = true,
  particleVariance = 0.8,
  rotationSpeed = 0.002,
  pulseSpeed = 2.5
}: AntigravityProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: -999, y: -999, lastMoved: Date.now() });
  const virtualMouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const resize = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
      mouseRef.current.lastMoved = Date.now();
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Initialize particles
    const particles: Particle[] = Array.from({ length: count }, () => {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      return {
        t: Math.random() * 100,
        speed: 0.02 + Math.random() * 0.03,
        mx: x,
        my: y,
        cx: x,
        cy: y,
        radiusOffset: (Math.random() - 0.5) * 15
      };
    });

    let globalRotation = 0;

    const render = (timestamp: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      globalRotation += rotationSpeed;

      let targetX = mouseRef.current.x;
      let targetY = mouseRef.current.y;

      if (autoAnimate && Date.now() - mouseRef.current.lastMoved > 1500) {
        const time = timestamp * 0.001;
        targetX = canvas.width / 2 + Math.sin(time * 0.8) * (canvas.width / 4);
        targetY = canvas.height / 2 + Math.cos(time * 0.6) * (canvas.height / 4);
      }

      virtualMouseRef.current.x += (targetX - virtualMouseRef.current.x) * 0.05;
      virtualMouseRef.current.y += (targetY - virtualMouseRef.current.y) * 0.05;

      const vx = virtualMouseRef.current.x;
      const vy = virtualMouseRef.current.y;

      particles.forEach((p, i) => {
        p.t += p.speed;
        const dx = p.mx - vx;
        const dy = p.my - vy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let destX = p.mx;
        let destY = p.my;

        if (dist < magnetRadius) {
          const angle = Math.atan2(dy, dx) + globalRotation;
          const wave = Math.sin(p.t * waveSpeed + angle) * (8 * waveAmplitude);
          const currentRadius = ringRadius + wave + p.radiusOffset;
          destX = vx + currentRadius * Math.cos(angle);
          destY = vy + currentRadius * Math.sin(angle);
        }

        p.cx += (destX - p.cx) * lerpSpeed;
        p.cy += (destY - p.cy) * lerpSpeed;

        const sizePulse = 1 + Math.sin(p.t * pulseSpeed) * 0.3 * particleVariance;
        const size = particleSize * sizePulse;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, size, 0, Math.PI * 2);
        ctx.fill();
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [count, magnetRadius, ringRadius, waveSpeed, waveAmplitude, particleSize, lerpSpeed, color, autoAnimate, particleVariance, rotationSpeed, pulseSpeed]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none'
      }}
    />
  );
}
