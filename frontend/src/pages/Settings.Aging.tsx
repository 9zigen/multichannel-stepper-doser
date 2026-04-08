import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ClipboardPaste, TimerReset, TriangleAlert, Wrench } from 'lucide-react';
import { toast } from 'sonner';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { PumpAgingState, PumpState } from '@/lib/api.ts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

function parseHours(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function getStatus(pump: PumpState): 'nominal' | 'warning' | 'replace' {
  if (pump.running_hours >= pump.aging.replace_hours) {
    return 'replace';
  }
  if (pump.running_hours >= pump.aging.warning_hours) {
    return 'warning';
  }
  return 'nominal';
}

const AgingPage: React.FC = (): React.ReactElement => {
  const pumps = useAppStore((state: AppStoreState) => state.settings.pumps);
  const saveSettings = useAppStore((state: AppStoreState) => state.saveSettings);
  const loadSettings = useAppStore((state: AppStoreState) => state.loadSettings);
  const [draftPumps, setDraftPumps] = useState<PumpState[]>([]);
  const [clipboard, setClipboard] = useState<{ sourceName: string; aging: PumpAgingState } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftPumps(JSON.parse(JSON.stringify(pumps)) as PumpState[]);
  }, [pumps]);

  const isDirty = useMemo(() => JSON.stringify(draftPumps) !== JSON.stringify(pumps), [draftPumps, pumps]);

  const updatePumpAging = (pumpId: number, field: keyof PumpAgingState, value: number) => {
    setDraftPumps((current) =>
      current.map((pump) =>
        pump.id === pumpId
          ? {
              ...pump,
              aging: {
                ...pump.aging,
                [field]: value,
              },
            }
          : pump
      )
    );
  };

  const copyPumpAging = (pump: PumpState) => {
    setClipboard({
      sourceName: pump.name,
      aging: { ...pump.aging },
    });
    toast.success(`${pump.name} aging thresholds copied.`);
  };

  const pastePumpAging = (pumpId: number) => {
    if (!clipboard) {
      return;
    }

    setDraftPumps((current) =>
      current.map((pump) => (pump.id === pumpId ? { ...pump, aging: { ...clipboard.aging } } : pump))
    );
  };

  const applyToAll = (pump: PumpState) => {
    setDraftPumps((current) => current.map((item) => ({ ...item, aging: { ...pump.aging } })));
    toast.success(`${pump.name} thresholds applied to all pumps.`);
  };

  const copyFromPump = (sourcePumpId: number, targetPumpId: number) => {
    const source = draftPumps.find((pump) => pump.id === sourcePumpId);
    if (!source) {
      return;
    }

    setDraftPumps((current) =>
      current.map((pump) => (pump.id === targetPumpId ? { ...pump, aging: { ...source.aging } } : pump))
    );
  };

  const saveDraft = async () => {
    try {
      setIsSaving(true);
      const success = await saveSettings('pumps', { pumps: draftPumps });
      if (!success) {
        toast.error('Pump aging settings not saved.');
        return;
      }

      await loadSettings();
      toast.success('Pump aging settings saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetDraft = () => {
    setDraftPumps(JSON.parse(JSON.stringify(pumps)) as PumpState[]);
  };

  const dueForReplacement = draftPumps.filter((pump) => getStatus(pump) === 'replace').length;
  const approachingService = draftPumps.filter((pump) => getStatus(pump) === 'warning').length;

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-6">
      <section className="container grid gap-8 px-4 md:px-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="shadow-none animate-in fade-in zoom-in">
          <CardHeader>
            <CardTitle className="text-xl">Aging Overview</CardTitle>
            <CardDescription>
              Configure per-pump hose service thresholds so wear warnings follow your hardware and chemistry.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <TimerReset className="size-4 text-muted-foreground" />
                  Service state
                </div>
                <Badge variant="secondary">{draftPumps.length}</Badge>
              </div>
              <div className="grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Approaching service</span>
                  <Badge variant={approachingService > 0 ? 'secondary' : 'outline'}>{approachingService}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Replacement due</span>
                  <Badge variant={dueForReplacement > 0 ? 'destructive' : 'outline'}>{dueForReplacement}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Clipboard preset</span>
                  <Badge variant={clipboard ? 'default' : 'outline'}>{clipboard?.sourceName ?? 'Empty'}</Badge>
                </div>
              </div>
            </div>

            <Alert className="p-4">
              <TriangleAlert />
              <AlertTitle>Recommended starting point</AlertTitle>
              <AlertDescription>
                A standard 3-roller hose at 600 RPM typically lands around 200-300 hours. Use 200 as warning and 250
                as planned replacement, then tune from real service history.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="shadow-none animate-in fade-in zoom-in">
            <CardHeader>
              <CardTitle className="text-xl">Pump Thresholds</CardTitle>
              <CardDescription>Each pump can keep its own warning and replacement schedule, with quick copy actions.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {draftPumps.map((pump) => {
                  const status = getStatus(pump);

                  return (
                    <div key={pump.id} className="rounded-xl border bg-card p-4">
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="font-medium">{pump.name}</div>
                          <div className="text-sm text-muted-foreground">
                            Current runtime: {pump.running_hours.toFixed(1)} h
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant={status === 'replace' ? 'destructive' : status === 'warning' ? 'secondary' : 'outline'}>
                            {status === 'replace' ? 'Replace now' : status === 'warning' ? 'Plan service' : 'Nominal'}
                          </Badge>
                          <Button type="button" variant="outline" size="sm" onClick={() => copyPumpAging(pump)}>
                            <Copy data-icon="inline-start" />
                            Copy
                          </Button>
                          <Button type="button" variant="outline" size="sm" disabled={!clipboard} onClick={() => pastePumpAging(pump.id)}>
                            <ClipboardPaste data-icon="inline-start" />
                            Paste
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => applyToAll(pump)}>
                            <Wrench data-icon="inline-start" />
                            Copy to all
                          </Button>
                        </div>
                      </div>

                      <FieldGroup className="gap-4">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]">
                          <Field>
                            <FieldLabel htmlFor={`warning_${pump.id}`}>Warning hours</FieldLabel>
                            <FieldContent>
                              <Input
                                id={`warning_${pump.id}`}
                                type="number"
                                value={pump.aging.warning_hours}
                                onChange={(event) => updatePumpAging(pump.id, 'warning_hours', parseHours(event.target.value))}
                              />
                              <FieldDescription>Show service planning state once runtime crosses this point.</FieldDescription>
                            </FieldContent>
                          </Field>

                          <Field>
                            <FieldLabel htmlFor={`replace_${pump.id}`}>Replace hours</FieldLabel>
                            <FieldContent>
                              <Input
                                id={`replace_${pump.id}`}
                                type="number"
                                value={pump.aging.replace_hours}
                                onChange={(event) => updatePumpAging(pump.id, 'replace_hours', parseHours(event.target.value))}
                              />
                              <FieldDescription>Mark the hose as due once runtime reaches this threshold.</FieldDescription>
                            </FieldContent>
                          </Field>

                          <Field>
                            <FieldLabel>Copy from another pump</FieldLabel>
                            <FieldContent className="gap-2">
                              <div className="grid gap-2">
                                {draftPumps
                                  .filter((candidate) => candidate.id !== pump.id)
                                  .map((candidate) => (
                                    <Button
                                      key={candidate.id}
                                      type="button"
                                      variant="outline"
                                      className="justify-start"
                                      onClick={() => copyFromPump(candidate.id, pump.id)}
                                    >
                                      {candidate.name}
                                    </Button>
                                  ))}
                              </div>
                            </FieldContent>
                          </Field>
                        </div>
                      </FieldGroup>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none animate-in fade-in zoom-in">
            <CardHeader>
              <CardTitle className="text-xl">Apply Changes</CardTitle>
              <CardDescription>Saving updates pump aging thresholds without touching board or network configuration.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" onClick={() => void saveDraft()} disabled={!isDirty || isSaving}>
                {isSaving ? 'Saving...' : 'Save thresholds'}
              </Button>
              <Button type="button" variant="outline" onClick={resetDraft} disabled={!isDirty || isSaving}>
                Reset changes
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default AgingPage;
