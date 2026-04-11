import React, { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardPaste, Copy, LoaderCircle, RotateCcw, Wrench } from 'lucide-react';
import { toast } from 'sonner';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { PumpAgingState, PumpState } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function parseHours(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function getStatus(pump: PumpState): 'nominal' | 'warning' | 'replace' {
  if (pump.running_hours >= pump.aging.replace_hours) return 'replace';
  if (pump.running_hours >= pump.aging.warning_hours) return 'warning';
  return 'nominal';
}

const statusConfig = {
  nominal: { label: 'Nominal', badgeVariant: 'outline' as const, barClass: 'from-primary via-primary/85 to-accent' },
  warning: { label: 'Warning', badgeVariant: 'secondary' as const, barClass: 'from-amber-500 to-amber-400' },
  replace: { label: 'Replace', badgeVariant: 'destructive' as const, barClass: 'from-destructive to-destructive/70' },
};

const AgingPage: React.FC = (): React.ReactElement => {
  const pumps = useAppStore((state: AppStoreState) => state.settings.pumps);
  const saveSettings = useAppStore((state: AppStoreState) => state.saveSettings);
  const loadSettings = useAppStore((state: AppStoreState) => state.loadSettings);
  const [draftPumps, setDraftPumps] = useState<PumpState[]>([]);
  const [clipboard, setClipboard] = useState<PumpAgingState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftPumps(JSON.parse(JSON.stringify(pumps)) as PumpState[]);
  }, [pumps]);

  const isDirty = useMemo(() => JSON.stringify(draftPumps) !== JSON.stringify(pumps), [draftPumps, pumps]);

  const updatePumpAging = (pumpId: number, field: keyof PumpAgingState, value: number) => {
    setDraftPumps((current) =>
      current.map((pump) =>
        pump.id === pumpId ? { ...pump, aging: { ...pump.aging, [field]: value } } : pump,
      ),
    );
  };

  const copyAging = (pump: PumpState) => {
    setClipboard({ ...pump.aging });
    toast.success(`${pump.name} thresholds copied.`);
  };

  const pasteAging = (pumpId: number) => {
    if (!clipboard) return;
    setDraftPumps((current) =>
      current.map((pump) => (pump.id === pumpId ? { ...pump, aging: { ...clipboard } } : pump)),
    );
  };

  const applyToAll = (pump: PumpState) => {
    setDraftPumps((current) => current.map((item) => ({ ...item, aging: { ...pump.aging } })));
    toast.success(`${pump.name} thresholds applied to all.`);
  };

  const saveDraft = async () => {
    try {
      setIsSaving(true);
      const success = await saveSettings('pumps', { pumps: draftPumps });
      if (!success) {
        toast.error('Aging settings not saved.');
        return;
      }
      await loadSettings();
      toast.success('Aging settings saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetDraft = () => {
    setDraftPumps(JSON.parse(JSON.stringify(pumps)) as PumpState[]);
  };

  const stats = useMemo(() => {
    const replace = draftPumps.filter((p) => getStatus(p) === 'replace').length;
    const warning = draftPumps.filter((p) => getStatus(p) === 'warning').length;
    const nominal = draftPumps.length - replace - warning;
    return { replace, warning, nominal };
  }, [draftPumps]);

  return (
    <div className="flex flex-col gap-4 py-2 md:py-3">
      <section className="mx-auto w-full max-w-screen-2xl px-3">
        <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg">Aging Thresholds</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1.5 tabular-nums">
                  {stats.nominal} nominal
                </Badge>
                {stats.warning > 0 && (
                  <Badge variant="secondary" className="gap-1.5 tabular-nums">
                    {stats.warning} warning
                  </Badge>
                )}
                {stats.replace > 0 && (
                  <Badge variant="destructive" className="gap-1.5 tabular-nums">
                    {stats.replace} replace
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {/* Pump rows */}
            <div className="flex flex-col gap-2">
              {draftPumps.map((pump, index) => {
                const status = getStatus(pump);
                const config = statusConfig[status];
                const progress = pump.aging.replace_hours > 0
                  ? Math.min((pump.running_hours / pump.aging.replace_hours) * 100, 100)
                  : 0;
                const warningMark = pump.aging.replace_hours > 0
                  ? (pump.aging.warning_hours / pump.aging.replace_hours) * 100
                  : 0;

                return (
                  <div
                    key={pump.id}
                    className="animate-fade-in-up rounded-lg border border-border/40 bg-secondary/10 p-3"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Row 1: Name + status + actions */}
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-medium">{pump.name}</span>
                        <Badge variant={config.badgeVariant} className="text-xs">
                          {config.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => copyAging(pump)}>
                              <Copy className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy thresholds</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="size-7" disabled={!clipboard} onClick={() => pasteAging(pump.id)}>
                              <ClipboardPaste className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Paste thresholds</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => applyToAll(pump)}>
                              <Wrench className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Apply to all pumps</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    {/* Row 2: Progress bar + runtime */}
                    <div className="mb-3 flex items-center gap-3">
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full bg-linear-to-r transition-all', config.barClass)}
                          style={{ width: `${Math.max(progress, progress > 0 ? 6 : 0)}%` }}
                        />
                        {warningMark > 0 && warningMark < 100 && (
                          <div
                            className="absolute top-0 h-full w-0.5 bg-amber-500/70"
                            style={{ left: `${warningMark}%` }}
                          />
                        )}
                        <div className="absolute top-0 right-0 h-full w-0.5 bg-destructive/70" />
                      </div>
                      <span className="min-w-16 text-right text-xs tabular-nums text-muted-foreground">
                        {pump.running_hours.toFixed(1)} h
                      </span>
                    </div>

                    {/* Row 3: Inline inputs */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <label htmlFor={`warn_${pump.id}`} className="shrink-0 text-xs text-muted-foreground">
                          Warn
                        </label>
                        <Input
                          id={`warn_${pump.id}`}
                          type="number"
                          className="h-7 text-xs tabular-nums"
                          value={pump.aging.warning_hours}
                          onChange={(e) => updatePumpAging(pump.id, 'warning_hours', parseHours(e.target.value))}
                        />
                        <span className="text-xs text-muted-foreground">h</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label htmlFor={`repl_${pump.id}`} className="shrink-0 text-xs text-muted-foreground">
                          Replace
                        </label>
                        <Input
                          id={`repl_${pump.id}`}
                          type="number"
                          className="h-7 text-xs tabular-nums"
                          value={pump.aging.replace_hours}
                          onChange={(e) => updatePumpAging(pump.id, 'replace_hours', parseHours(e.target.value))}
                        />
                        <span className="text-xs text-muted-foreground">h</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Save / Reset bar */}
            <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-3">
              <Button type="button" variant="outline" size="sm" onClick={resetDraft} disabled={!isDirty || isSaving}>
                <RotateCcw className="size-3.5" data-icon="inline-start" />
                Reset
              </Button>
              <Button type="button" size="sm" onClick={() => void saveDraft()} disabled={!isDirty || isSaving}>
                {isSaving ? (
                  <>
                    <LoaderCircle className="size-3.5 animate-spin" data-icon="inline-start" />
                    Saving
                  </>
                ) : (
                  <>
                    <Check className="size-3.5" data-icon="inline-start" />
                    Save thresholds
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default AgingPage;
