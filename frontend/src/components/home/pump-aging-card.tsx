import React from 'react';
import { TimerReset } from 'lucide-react';

import { PumpState } from '@/lib/api.ts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type PumpAgingCardProps = {
  pumps: PumpState[];
  resettingPumpId: number | null;
  onResetPumpCounter: (pumpId: number) => void;
};

const formatHours = (value: number) => `${value.toFixed(1)} h`;

const formatAgingStatus = (runningHours: number, warningHours: number, replaceHours: number) => {
  if (runningHours >= replaceHours) {
    return 'Replacement due';
  }
  if (runningHours >= warningHours) {
    return 'Service suggested';
  }
  return 'Nominal';
};

const PumpAgingCard = ({
  pumps,
  resettingPumpId,
  onResetPumpCounter,
}: PumpAgingCardProps): React.ReactElement => {
  return (
    <Card className="overflow-hidden border-white/45 bg-card/82 shadow-lg animate-in fade-in zoom-in">
      <CardHeader>
        <CardTitle className="text-xl">Pump Aging</CardTitle>
        <CardDescription>
          Track head wear and reset the running-hours counter after replacing tubing, rotor, or dosing line
          components.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-2 2xl:grid-cols-4">
          {pumps.map((pump) => {
            const percentage = pump.tank_full_vol > 0 ? Math.round((pump.tank_current_vol / pump.tank_full_vol) * 100) : 0;
            const warning = pump.running_hours >= pump.aging.warning_hours;
            const replacementDue = pump.running_hours >= pump.aging.replace_hours;
            const agingProgress =
              pump.aging.replace_hours > 0 ? Math.max(8, Math.min((pump.running_hours / pump.aging.replace_hours) * 100, 100)) : 8;

            return (
              <Card
                key={pump.id}
                className={cn(
                  'overflow-hidden border-white/45 bg-gradient-to-br from-card via-card to-secondary/25 shadow-md',
                  warning && 'to-destructive/10'
                )}
              >
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-2">
                      <CardTitle className="text-lg">{pump.name}</CardTitle>
                      <CardDescription className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{percentage}% full</Badge>
                        <Badge variant={pump.state ? 'default' : 'outline'}>{pump.state ? 'Enabled' : 'Disabled'}</Badge>
                      </CardDescription>
                    </div>
                    <Badge variant={replacementDue ? 'destructive' : warning ? 'secondary' : 'outline'}>
                      {formatHours(pump.running_hours)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      <span>Wear estimate</span>
                      <span>{formatAgingStatus(pump.running_hours, pump.aging.warning_hours, pump.aging.replace_hours)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full bg-gradient-to-r transition-all',
                          replacementDue
                            ? 'from-destructive to-destructive/70'
                            : warning
                              ? 'from-amber-500 to-amber-400'
                              : 'from-primary via-primary/85 to-accent'
                        )}
                        style={{ width: `${agingProgress}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Current volume</span>
                      <span className="font-medium">{pump.tank_current_vol.toFixed(0)} ml</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Calibration points</span>
                      <span className="font-medium">{pump.calibration.length}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Warning / replace</span>
                      <span className="font-medium">
                        {pump.aging.warning_hours}h / {pump.aging.replace_hours}h
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={resettingPumpId === pump.id}
                    onClick={() => onResetPumpCounter(pump.id)}
                  >
                    <TimerReset data-icon="inline-start" />
                    {resettingPumpId === pump.id ? 'Resetting...' : 'Reset running hours'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default PumpAgingCard;
