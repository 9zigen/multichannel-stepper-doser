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

const getWearStatus = (hours: number, warningHours: number, replaceHours: number) => {
  if (hours >= replaceHours) {
    return { label: 'Replace', variant: 'destructive' as const, barClass: 'from-destructive to-destructive/70' };
  }
  if (hours >= warningHours) {
    return { label: 'Warning', variant: 'secondary' as const, barClass: 'from-amber-500 to-amber-400' };
  }
  return { label: 'Nominal', variant: 'outline' as const, barClass: 'from-primary via-primary/85 to-accent' };
};

const PumpAgingCard = ({
  pumps,
  resettingPumpId,
  onResetPumpCounter,
}: PumpAgingCardProps): React.ReactElement => {
  return (
    <Card className="overflow-hidden border-border bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg">Pump Aging</CardTitle>
        <CardDescription>
          Track head wear and reset the running-hours counter after replacing tubing, rotor, or dosing line components.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="whitespace-nowrap py-2 pr-4 text-left font-medium">Pump</th>
                <th className="whitespace-nowrap py-2 px-4 text-right font-medium">Hours</th>
                <th className="whitespace-nowrap py-2 px-4 text-left font-medium min-w-[180px]">Wear</th>
                <th className="whitespace-nowrap py-2 px-4 text-right font-medium">Tank</th>
                <th className="whitespace-nowrap py-2 px-4 text-center font-medium">Status</th>
                <th className="whitespace-nowrap py-2 pl-4 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {pumps.map((pump, index) => {
                const tankPercent = pump.tank_full_vol > 0
                  ? Math.round((pump.tank_current_vol / pump.tank_full_vol) * 100)
                  : 0;
                const wear = getWearStatus(pump.running_hours, pump.aging.warning_hours, pump.aging.replace_hours);
                const agingProgress = pump.aging.replace_hours > 0
                  ? Math.min((pump.running_hours / pump.aging.replace_hours) * 100, 100)
                  : 0;
                const warningMark = pump.aging.replace_hours > 0
                  ? (pump.aging.warning_hours / pump.aging.replace_hours) * 100
                  : 0;

                return (
                  <tr
                    key={pump.id}
                    className="animate-fade-in-up border-b border-border/50 last:border-0"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <td className="whitespace-nowrap py-3 pr-4">
                      <span className="font-medium">{pump.name}</span>
                    </td>
                    <td className="whitespace-nowrap py-3 px-4 text-right">
                      <Badge variant={wear.variant} className="font-semibold tabular-nums">
                        {pump.running_hours.toFixed(1)} h
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full bg-gradient-to-r transition-all',
                              wear.barClass
                            )}
                            style={{ width: `${Math.max(agingProgress, agingProgress > 0 ? 6 : 0)}%` }}
                          />
                          {warningMark > 0 && warningMark < 100 && (
                            <div
                              className="absolute top-0 h-full w-0.5 bg-amber-500/70"
                              style={{ left: `${warningMark}%` }}
                              title={`Warning at ${pump.aging.warning_hours}h`}
                            />
                          )}
                          <div
                            className="absolute top-0 right-0 h-full w-0.5 bg-destructive/70"
                            title={`Replace at ${pump.aging.replace_hours}h`}
                          />
                        </div>
                        <span className={cn(
                          'w-16 text-right text-xs',
                          wear.variant === 'destructive' ? 'font-semibold text-destructive' :
                          wear.variant === 'secondary' ? 'font-medium text-amber-600' :
                          'text-muted-foreground'
                        )}>
                          {wear.label}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-3 px-4 text-right">
                      <span className={cn(
                        'tabular-nums',
                        tankPercent <= 15 ? 'font-semibold text-destructive' :
                        tankPercent <= 30 ? 'font-medium text-amber-600' :
                        'text-muted-foreground'
                      )}>
                        {tankPercent}%
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-3 px-4 text-center">
                      <Badge variant={pump.state ? 'default' : 'outline'} className="text-xs">
                        {pump.state ? 'On' : 'Off'}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap py-3 pl-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={resettingPumpId === pump.id}
                        title="Reset running hours"
                        onClick={() => onResetPumpCounter(pump.id)}
                      >
                        <TimerReset className={cn('size-4', resettingPumpId === pump.id && 'animate-spin')} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default PumpAgingCard;
