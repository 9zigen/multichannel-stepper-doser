import React, { useEffect, useMemo, useState } from 'react';
import { Cog, Droplets, FlaskConical, Gauge } from 'lucide-react';

import { PumpState } from '@/lib/api.ts';
import { useAppStore } from '@/hooks/use-store.ts';
import PumpForm from '@/components/pump-form.tsx';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer.tsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { cn } from '@/lib/utils';

const PumpsPage: React.FC = (): React.ReactElement => {
  const isMobile = useIsMobile();
  const appStore = useAppStore();
  const { settings } = appStore;
  const { pumps } = settings;
  const [selectedPump, setSelectedPump] = useState<PumpState | null>(null);

  useEffect(() => {
    if (selectedPump !== null) {
      const pump = pumps.find((item) => item.id === selectedPump.id);
      if (pump) setSelectedPump(pump);
    }
  }, [settings]);

  const activePumps = useMemo(() => pumps.filter((pump) => pump.state).length, [pumps]);
  const totalVolume = useMemo(() => pumps.reduce((sum, pump) => sum + pump.tank_current_vol, 0), [pumps]);
  const totalCapacity = useMemo(() => pumps.reduce((sum, pump) => sum + pump.tank_full_vol, 0), [pumps]);
  const inventoryPercent = totalCapacity > 0 ? Math.round((totalVolume / totalCapacity) * 100) : 0;

  return (
    <div className="flex flex-col gap-4 py-2 md:py-3">
      <section className="mx-auto w-full max-w-screen-2xl px-3">
        <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Droplets className="size-4 text-muted-foreground" />
                <CardTitle className="text-lg">Pumps</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5 tabular-nums">
                  {activePumps}/{pumps.length} active
                </Badge>
                <Badge variant="secondary" className="tabular-nums">
                  {inventoryPercent}% inventory
                </Badge>
                <Badge variant="secondary" className="tabular-nums">
                  {totalVolume.toFixed(0)} ml
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {pumps?.map((pump, index) => {
                const percentage =
                  pump.tank_full_vol > 0 ? Math.round((pump.tank_current_vol / pump.tank_full_vol) * 100) : 0;
                const lowInventory = percentage <= 25;

                return (
                  <div
                    key={pump.id}
                    className="animate-fade-in-up rounded-lg border border-border/40 bg-secondary/10 p-3 transition-transform duration-200 hover:-translate-y-0.5"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Header */}
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{pump.name}</span>
                        <Badge variant={pump.state ? 'default' : 'outline'} className="text-xs">
                          {pump.state ? 'On' : 'Off'}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => setSelectedPump({ ...pump })}
                      >
                        <Cog className="size-3.5" />
                      </Button>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-2">
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                        <span className="flex items-center gap-1">
                          <Droplets className="size-3" />
                          {pump.tank_current_vol.toFixed(0)} / {pump.tank_full_vol.toFixed(0)} ml
                        </span>
                        <Badge variant={lowInventory ? 'destructive' : 'secondary'} className="text-xs tabular-nums">
                          {percentage}%
                        </Badge>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full bg-linear-to-r transition-all',
                            lowInventory
                              ? 'from-destructive to-destructive/70'
                              : 'from-primary via-primary/85 to-accent',
                          )}
                          style={{ width: `${Math.max(6, Math.min(percentage, 100))}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="flex flex-col items-center gap-0.5 rounded-md bg-background/50 px-2 py-1.5">
                        <Gauge className="size-3 text-muted-foreground" />
                        <span className="font-medium">{pump.direction ? 'CW' : 'CCW'}</span>
                      </div>
                      <div className="flex flex-col items-center gap-0.5 rounded-md bg-background/50 px-2 py-1.5">
                        <FlaskConical className="size-3 text-muted-foreground" />
                        <span className="font-medium tabular-nums">{pump.calibration.length} pts</span>
                      </div>
                      <div className="flex flex-col items-center gap-0.5 rounded-md bg-background/50 px-2 py-1.5">
                        <span className="text-muted-foreground">conc.</span>
                        <span className="font-medium tabular-nums">{pump.tank_concentration_active.toFixed(0)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {isMobile ? (
          <Drawer open={selectedPump !== null} onClose={() => setSelectedPump(null)}>
            <DrawerContent className="h-[calc(100vh-10px)] border-border bg-card/95 px-4 pb-4 backdrop-blur-xl">
              <div className="mx-auto flex w-full flex-col items-center sm:w-[400px]">
                <DrawerHeader className="text-center">
                  <DrawerTitle>Edit: {selectedPump?.name}</DrawerTitle>
                  <DrawerDescription>Adjust pump identity, tank data, and calibration.</DrawerDescription>
                </DrawerHeader>
                <div className="flex flex-col">
                  {selectedPump === null ? null : (
                    <PumpForm pump={selectedPump} success={() => setSelectedPump(null)} />
                  )}
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <Dialog open={selectedPump !== null} onOpenChange={() => setSelectedPump(null)}>
            <DialogContent className="border-border bg-card/96 shadow-xl backdrop-blur-xl sm:max-w-[425px] lg:max-w-[500px] xl:max-w-[800px]">
              <DialogHeader>
                <DialogTitle>Edit: {selectedPump?.name}</DialogTitle>
                <DialogDescription>Adjust pump identity, tank data, and calibration.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col">
                {selectedPump === null ? null : <PumpForm pump={selectedPump} success={() => setSelectedPump(null)} />}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </section>
    </div>
  );
};

export default PumpsPage;
