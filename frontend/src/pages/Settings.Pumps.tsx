import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Cog, Droplets, FlaskConical, Gauge, Settings2 } from 'lucide-react';

import { PumpState } from '@/lib/api.ts';
import { useAppStore } from '@/hooks/use-store.ts';
import PumpForm from '@/components/pump-form.tsx';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer.tsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile.ts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
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
      if (pump) {
        setSelectedPump(pump);
      }
    }
  }, [settings]);

  const activePumps = useMemo(() => pumps.filter((pump) => pump.state).length, [pumps]);
  const totalVolume = useMemo(() => pumps.reduce((sum, pump) => sum + pump.tank_current_vol, 0), [pumps]);
  const totalCapacity = useMemo(() => pumps.reduce((sum, pump) => sum + pump.tank_full_vol, 0), [pumps]);
  const calibrationPoints = useMemo(() => pumps.reduce((sum, pump) => sum + pump.calibration.length, 0), [pumps]);
  const inventoryPercent = totalCapacity > 0 ? Math.round((totalVolume / totalCapacity) * 100) : 0;

  const renderRotation = (pump: PumpState) => (pump.direction ? 'CW' : 'CCW');

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-6">
      <section className="container grid gap-8 px-4 md:px-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="overflow-hidden border-white/45 bg-card/82 shadow-lg animate-in fade-in zoom-in">
          <CardHeader>
            <CardTitle className="text-xl">Pump Overview</CardTitle>
            <CardDescription>
              Track dosing inventory, calibration coverage, and which heads are ready for operation.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <Activity className="size-4 text-muted-foreground" />
                  Runtime status
                </div>
                <Badge variant="secondary">
                  {activePumps}/{pumps.length} active
                </Badge>
              </div>
              <div className="grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Total inventory</span>
                  <Badge variant="outline">{inventoryPercent}%</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Available volume</span>
                  <Badge variant="secondary">{totalVolume.toFixed(0)} ml</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Calibration points</span>
                  <Badge variant="secondary">{calibrationPoints}</Badge>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-linear-to-br from-secondary/45 via-card to-card p-5 shadow-sm dark:shadow-none">
              <div className="mb-2 font-medium">Quick guidance</div>
              <div className="grid gap-3 text-muted-foreground">
                <div>
                  <div className="text-xs uppercase tracking-wide">Inventory</div>
                  <div>Use tank volume as an operational estimate, not a lab-grade measurement.</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide">Calibration</div>
                  <div>Keep at least two points per pump if speed changes matter for your dosing schedule.</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide">Direction</div>
                  <div>Lock rotation once tubing and head orientation are verified on the real hardware.</div>
                </div>
              </div>
            </div>

            <Alert className="border-white/10 bg-linear-to-br from-card via-card to-accent/10 p-4 shadow-sm dark:shadow-none">
              <Settings2 />
              <AlertTitle>Useful IoT defaults</AlertTitle>
              <AlertDescription>
                Keep reagent names explicit, track tank volume conservatively, and recalibrate after tubing changes or
                motor service.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="overflow-hidden border-white/45 bg-card/82 shadow-lg animate-in fade-in zoom-in">
            <CardHeader>
              <CardTitle className="text-xl">Pumps</CardTitle>
              <CardDescription>
                Each dosing head is presented as an operational card with editing isolated into a dedicated panel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2 2xl:grid-cols-3">
                {pumps?.map((pump) => {
                  const percentage =
                    pump.tank_full_vol > 0 ? Math.round((pump.tank_current_vol / pump.tank_full_vol) * 100) : 0;
                  const lowInventory = percentage <= 25;

                  return (
                    <Card
                      key={pump.id}
                      className="overflow-hidden border-white/50 bg-linear-to-br from-card via-card to-secondary/30 shadow-md transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      <div
                        className="h-1.5 w-full bg-linear-to-r from-primary via-primary/80 to-accent"
                        style={{ opacity: pump.state ? 1 : 0.35 }}
                      />
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex flex-col gap-2">
                            <CardTitle className="text-lg">{pump.name}</CardTitle>
                            <CardDescription className="flex flex-wrap items-center gap-2">
                              <Badge variant={lowInventory ? 'destructive' : 'secondary'}>
                                <Droplets data-icon="inline-start" />
                                {percentage}%
                              </Badge>
                              <Badge variant={pump.state ? 'default' : 'outline'}>
                                {pump.state ? 'Enabled' : 'Disabled'}
                              </Badge>
                            </CardDescription>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="cursor-pointer"
                            onClick={() => setSelectedPump({ ...pump })}
                          >
                            <Cog data-icon="inline-start" />
                            Edit
                          </Button>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                            <span>Inventory</span>
                            <span>
                              {pump.tank_current_vol.toFixed(0)} / {pump.tank_full_vol.toFixed(0)} ml
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                'h-full rounded-full bg-linear-to-r transition-all',
                                lowInventory
                                  ? 'from-destructive to-destructive/70'
                                  : 'from-primary via-primary/85 to-accent'
                              )}
                              style={{ width: `${Math.max(6, Math.min(percentage, 100))}%` }}
                            />
                          </div>
                        </div>
                        <div className="grid gap-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Gauge className="size-4" />
                              Rotation
                            </span>
                            <span className="font-medium">{renderRotation(pump)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <FlaskConical className="size-4" />
                              Calibration
                            </span>
                            <span className="font-medium">{pump.calibration.length} points</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Current volume</span>
                            <span className="font-medium">{pump.tank_current_vol.toFixed(0)} ml</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Tank capacity</span>
                            <span className="font-medium">{pump.tank_full_vol.toFixed(0)} ml</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Element concentration</span>
                            <span className="font-medium">{pump.tank_concentration_active.toFixed(0)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {isMobile ? (
          <Drawer open={selectedPump !== null} onClose={() => setSelectedPump(null)}>
            <DrawerContent className="h-[calc(100vh-10px)] border-white/45 bg-card/95 px-4 pb-4 backdrop-blur-xl">
              <div className="mx-auto flex w-full flex-col items-center sm:w-[400px]">
                <DrawerHeader className="text-center">
                  <DrawerTitle>Edit: {selectedPump?.name}</DrawerTitle>
                  <DrawerDescription>
                    Adjust pump identity, tank data, and calibration points in one place.
                  </DrawerDescription>
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
            <DialogContent className="border-white/45 bg-card/96 shadow-xl backdrop-blur-xl sm:max-w-[425px] lg:max-w-[500px] xl:max-w-[800px]">
              <DialogHeader>
                <DialogTitle>Edit: {selectedPump?.name}</DialogTitle>
                <DialogDescription>
                  Adjust pump identity, tank data, and calibration points in one place.
                </DialogDescription>
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
