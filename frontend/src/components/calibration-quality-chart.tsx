import React, { useMemo } from 'react';
import { Activity, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { PumpCalibrationState } from '@/lib/api';
import { cn } from '@/lib/utils';

type CalibrationQuality = 'empty' | 'single' | 'good' | 'check' | 'uneven';

type ChartPoint = PumpCalibrationState & {
  x: number;
  y: number;
  residual: number;
  suspicious: boolean;
};

type CalibrationQualityChartProps = {
  points: PumpCalibrationState[];
};

const WIDTH = 320;
const HEIGHT = 118;
const PADDING_X = 22;
const PADDING_TOP = 18;
const PADDING_BOTTOM = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function expectedFlow(sorted: PumpCalibrationState[], index: number): number {
  if (sorted.length < 3) return sorted[index].flow;

  if (index === 0) {
    const next = sorted[1];
    const last = sorted[sorted.length - 1];
    const speedSpan = last.speed - next.speed;
    if (speedSpan === 0) return sorted[index].flow;
    const slope = (last.flow - next.flow) / speedSpan;
    return next.flow + (sorted[0].speed - next.speed) * slope;
  }

  if (index === sorted.length - 1) {
    const first = sorted[0];
    const prev = sorted[index - 1];
    const speedSpan = prev.speed - first.speed;
    if (speedSpan === 0) return sorted[index].flow;
    const slope = (prev.flow - first.flow) / speedSpan;
    return prev.flow + (sorted[index].speed - prev.speed) * slope;
  }

  const left = sorted[index - 1];
  const right = sorted[index + 1];
  const speedSpan = right.speed - left.speed;
  if (speedSpan === 0) return sorted[index].flow;
  const slope = (right.flow - left.flow) / speedSpan;
  return left.flow + (sorted[index].speed - left.speed) * slope;
}

const qualityMeta: Record<CalibrationQuality, { label: string; icon: React.ElementType; className: string }> = {
  empty: { label: 'No data', icon: AlertTriangle, className: 'border-muted-foreground/20 text-muted-foreground' },
  single: { label: 'Needs 2+ points', icon: TrendingUp, className: 'border-amber-500/30 bg-amber-500/10 text-amber-700' },
  good: { label: 'Good', icon: CheckCircle2, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' },
  check: { label: 'Check point', icon: AlertTriangle, className: 'border-amber-500/30 bg-amber-500/10 text-amber-700' },
  uneven: { label: 'Uneven', icon: AlertTriangle, className: 'border-destructive/30 bg-destructive/10 text-destructive' },
};

export function CalibrationQualityChart({ points }: CalibrationQualityChartProps): React.ReactElement {
  const model = useMemo(() => {
    const sorted = [...points]
      .filter((point) => Number.isFinite(point.speed) && Number.isFinite(point.flow) && point.speed > 0 && point.flow > 0)
      .sort((a, b) => a.speed - b.speed);

    const minSpeed = sorted[0]?.speed ?? 0;
    const maxSpeed = sorted[sorted.length - 1]?.speed ?? 1;
    const minFlow = Math.min(...sorted.map((point) => point.flow), 0);
    const maxFlow = Math.max(...sorted.map((point) => point.flow), 1);
    const speedSpan = Math.max(maxSpeed - minSpeed, 1);
    const flowSpan = Math.max(maxFlow - minFlow, 1);
    const plotWidth = WIDTH - PADDING_X * 2;
    const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

    const chartPoints: ChartPoint[] = sorted.map((point, index) => {
      const expected = expectedFlow(sorted, index);
      const residual = sorted.length >= 3 && expected > 0 ? Math.abs(point.flow - expected) / expected : 0;
      return {
        ...point,
        x: PADDING_X + ((point.speed - minSpeed) / speedSpan) * plotWidth,
        y: PADDING_TOP + (1 - (point.flow - minFlow) / flowSpan) * plotHeight,
        residual,
        suspicious: residual > 0.18,
      };
    });

    const maxResidual = Math.max(...chartPoints.map((point) => point.residual), 0);
    const quality: CalibrationQuality =
      sorted.length === 0
        ? 'empty'
        : sorted.length === 1
          ? 'single'
          : maxResidual > 0.35
            ? 'uneven'
            : maxResidual > 0.18
              ? 'check'
              : 'good';

    return {
      sorted,
      chartPoints,
      quality,
      maxResidual,
      path: chartPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
      minSpeed,
      maxSpeed,
      maxFlow,
    };
  }, [points]);

  const meta = qualityMeta[model.quality];
  const Icon = meta.icon;
  const hasInterpolation = model.sorted.length >= 2;
  const message =
    model.quality === 'empty'
      ? 'Add calibration points to estimate flow across speeds.'
      : model.quality === 'single'
        ? 'Add another point for interpolation.'
        : model.quality === 'good'
          ? 'Interpolation curve is smooth across calibrated speeds.'
          : `Largest point deviation is ${(model.maxResidual * 100).toFixed(0)}%.`;

  return (
    <div className="mb-4 overflow-hidden rounded-md border border-border/40 bg-secondary/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Calibration curve</span>
        </div>
        <Badge variant="outline" className={cn('gap-1 text-xs', meta.className)}>
          <Icon className="size-3" />
          {meta.label}
        </Badge>
      </div>

      <div className="relative h-[118px] overflow-hidden rounded-md border border-border/30 bg-background/45">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full" role="img" aria-label="Calibration interpolation chart">
          <defs>
            <linearGradient id="calibration-line" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="var(--color-primary)" />
              <stop offset="100%" stopColor="var(--color-accent)" />
            </linearGradient>
            <linearGradient id="calibration-band" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <path d={`M ${PADDING_X} ${PADDING_TOP} H ${WIDTH - PADDING_X} M ${PADDING_X} ${HEIGHT - PADDING_BOTTOM} H ${WIDTH - PADDING_X}`} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3 5" />
          <path d={`M ${PADDING_X} ${PADDING_TOP} V ${HEIGHT - PADDING_BOTTOM} H ${WIDTH - PADDING_X}`} fill="none" stroke="var(--color-border)" strokeWidth="1" />

          {hasInterpolation && (
            <>
              <path d={`${model.path} L ${model.chartPoints[model.chartPoints.length - 1].x} ${HEIGHT - PADDING_BOTTOM} L ${model.chartPoints[0].x} ${HEIGHT - PADDING_BOTTOM} Z`} fill="url(#calibration-band)" opacity="0.7" />
              <path d={model.path} className="calibration-line-draw" fill="none" stroke="url(#calibration-line)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" pathLength={1} />
            </>
          )}

          {model.chartPoints.map((point, index) => (
            <g key={`${point.speed}-${point.flow}`} className="animate-fade-in-up" style={{ animationDelay: `${120 + index * 70}ms` }}>
              {point.residual > 0 && (
                <line x1={point.x} x2={point.x} y1={point.y} y2={clamp(point.y + point.residual * 72, PADDING_TOP, HEIGHT - PADDING_BOTTOM)} stroke={point.suspicious ? 'var(--color-destructive)' : 'var(--color-accent)'} strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
              )}
              <circle cx={point.x} cy={point.y} r={point.suspicious ? 4.5 : 3.5} fill={point.suspicious ? 'var(--color-destructive)' : 'var(--color-background)'} stroke={point.suspicious ? 'var(--color-destructive)' : 'var(--color-primary)'} strokeWidth="2" />
            </g>
          ))}

          <text x={PADDING_X} y={HEIGHT - 7} className="fill-muted-foreground text-[9px]">
            {formatNumber(model.minSpeed)} RPM
          </text>
          <text x={WIDTH - PADDING_X} y={HEIGHT - 7} textAnchor="end" className="fill-muted-foreground text-[9px]">
            {formatNumber(model.maxSpeed)} RPM
          </text>
          <text x={WIDTH - PADDING_X} y={12} textAnchor="end" className="fill-muted-foreground text-[9px]">
            {formatNumber(model.maxFlow)} ml/min
          </text>
        </svg>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
