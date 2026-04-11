import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cable, CircuitBoard, Network, RotateCw, Save } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { BoardConfigChannel, BoardConfigState, getBoardConfig, setBoardConfig } from '@/lib/api.ts';
import {
  createEmptyBoardConfig,
  getChannelMaxRpm,
  getMaxRpmForMicrosteps,
  MAX_BOARD_CHANNELS,
  MICROSTEP_OPTIONS,
} from '@/lib/board-config.ts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const parseNumericInput = (value: string): number => {
  if (value.trim() === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const validateBoardConfig = (config: BoardConfigState): string[] => {
  const errors: string[] = [];

  if (config.motors_num < 1 || config.motors_num > MAX_BOARD_CHANNELS) {
    errors.push(`Active channels must be between 1 and ${MAX_BOARD_CHANNELS}.`);
  }

  if (config.uart < 0 || config.uart > 2) {
    errors.push('UART must be 0, 1, or 2.');
  }

  if (config.tx_pin === config.rx_pin) {
    errors.push('TX and RX pins must be different.');
  }

  const allPins = new Map<number, string[]>();
  const activeChannels = config.channels.slice(0, config.motors_num);

  const addPinUse = (pin: number, label: string) => {
    if (!allPins.has(pin)) allPins.set(pin, []);
    allPins.get(pin)?.push(label);
  };

  addPinUse(config.tx_pin, 'UART TX');
  addPinUse(config.rx_pin, 'UART RX');

  activeChannels.forEach((channel) => {
    if (!MICROSTEP_OPTIONS.includes(channel.micro_steps as (typeof MICROSTEP_OPTIONS)[number])) {
      errors.push(`Channel ${channel.id + 1} has an invalid microstep value.`);
    }

    if (channel.dir_pin === channel.step_pin || channel.dir_pin === channel.en_pin || channel.step_pin === channel.en_pin) {
      errors.push(`Channel ${channel.id + 1} requires unique DIR, EN, and STEP pins.`);
    }

    addPinUse(channel.dir_pin, `CH${channel.id + 1} DIR`);
    addPinUse(channel.en_pin, `CH${channel.id + 1} EN`);
    addPinUse(channel.step_pin, `CH${channel.id + 1} STEP`);
  });

  allPins.forEach((uses, pin) => {
    if (uses.length < 2) return;
    const nonEnUses = uses.filter((use) => !use.endsWith(' EN'));
    const enUses = uses.filter((use) => use.endsWith(' EN'));
    if (nonEnUses.length === 0 && enUses.length > 1) return;
    errors.push(`GPIO ${pin} is assigned multiple times: ${uses.join(', ')}.`);
  });

  return errors;
};

const BoardPage: React.FC = (): React.ReactElement => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [config, setConfig] = useState<BoardConfigState>(createEmptyBoardConfig);
  const [initialConfig, setInitialConfig] = useState<BoardConfigState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadBoardConfig = async () => {
      try {
        const nextConfig = await getBoardConfig<BoardConfigState>();
        setConfig(nextConfig);
        setInitialConfig(nextConfig);
      } catch {
        toast.error('Failed to load board configuration.');
      } finally {
        setIsLoading(false);
      }
    };
    void loadBoardConfig();
  }, []);

  const validationErrors = useMemo(() => validateBoardConfig(config), [config]);
  const isDirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(initialConfig), [config, initialConfig]);
  const guidedMode = searchParams.get('guided') === '1';

  const updateSharedField = (field: keyof Omit<BoardConfigState, 'channels'>, value: number) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const updateChannelField = (channelId: number, field: keyof BoardConfigChannel, value: number) => {
    setConfig((current) => ({
      ...current,
      channels: current.channels.map((channel) =>
        channel.id === channelId ? { ...channel, [field]: value } : channel,
      ),
    }));
  };

  const resetDraft = () => {
    if (initialConfig) setConfig(initialConfig);
  };

  const handleSave = async () => {
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    try {
      setIsSaving(true);
      await setBoardConfig<{ success: boolean }>(config);
      setInitialConfig(config);
      toast.success('Board configuration saved and reloaded.');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data === 'string'
            ? error.response.data
            : (error.response?.data as { message?: string } | undefined)?.message;
        toast.error(message || 'Board configuration not saved.');
        return;
      }
      toast.error('Board configuration not saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 py-2 md:py-3">
      <section className="mx-auto w-full max-w-screen-2xl px-3">
        <div className="flex flex-col gap-4">
          {guidedMode && (
            <Alert className="p-4">
              <Network />
              <AlertTitle>Guided onboarding step</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>Review UART pins, active channels, and per-channel wiring. Save when ready.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchParams({});
                    navigate('/onboarding');
                  }}
                >
                  Return to onboarding
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CircuitBoard className="size-4 text-muted-foreground" />
                  <CardTitle className="text-lg">Board Configuration</CardTitle>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1.5 tabular-nums">
                    {config.motors_num} {config.motors_num === 1 ? 'channel' : 'channels'}
                  </Badge>
                  <Badge variant="secondary">UART{config.uart}</Badge>
                  <Badge variant="secondary" className="tabular-nums">
                    TX {config.tx_pin} / RX {config.rx_pin}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Shared driver settings */}
              <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  TMC2209 Shared Settings
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="uart" className="text-xs text-muted-foreground">UART</Label>
                    <Select value={String(config.uart)} onValueChange={(v) => updateSharedField('uart', Number(v))}>
                      <SelectTrigger id="uart" className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">UART0</SelectItem>
                        <SelectItem value="1">UART1</SelectItem>
                        <SelectItem value="2">UART2</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="tx_pin" className="text-xs text-muted-foreground">TX Pin</Label>
                    <Input
                      id="tx_pin"
                      type="number"
                      className="h-8 text-sm tabular-nums"
                      value={config.tx_pin}
                      onChange={(e) => updateSharedField('tx_pin', parseNumericInput(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="rx_pin" className="text-xs text-muted-foreground">RX Pin</Label>
                    <Input
                      id="rx_pin"
                      type="number"
                      className="h-8 text-sm tabular-nums"
                      value={config.rx_pin}
                      onChange={(e) => updateSharedField('rx_pin', parseNumericInput(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="motors_num" className="text-xs text-muted-foreground">Active Channels</Label>
                    <Select
                      value={String(config.motors_num)}
                      onValueChange={(v) => updateSharedField('motors_num', Number(v))}
                    >
                      <SelectTrigger id="motors_num" className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n} {n === 1 ? 'channel' : 'channels'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Channel wiring */}
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-1">
                  Channel Wiring
                </div>
                {config.channels.map((channel, index) => {
                  const isActive = channel.id < config.motors_num;

                  return (
                    <div
                      key={channel.id}
                      className={cn(
                        'animate-fade-in-up rounded-lg border border-border/40 bg-secondary/10 p-3 transition-opacity',
                        !isActive && 'opacity-40',
                        isActive && 'border-border/50',
                      )}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {/* Channel header */}
                      <div className="mb-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex size-6 items-center justify-center rounded bg-secondary/50">
                            <Cable className="size-3 text-muted-foreground" />
                          </div>
                          <span className="text-sm font-medium">CH {channel.id + 1}</span>
                          <Badge variant={isActive ? 'default' : 'outline'} className="text-xs">
                            {isActive ? 'Active' : 'Idle'}
                          </Badge>
                        </div>
                        <Badge variant="secondary" className="text-xs tabular-nums">
                          <RotateCw className="mr-1 size-3" />
                          {getChannelMaxRpm(channel)} RPM
                        </Badge>
                      </div>

                      {/* Pin inputs */}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`dir_${channel.id}`} className="text-xs text-muted-foreground">DIR</Label>
                          <Input
                            id={`dir_${channel.id}`}
                            type="number"
                            className="h-8 text-sm tabular-nums"
                            value={channel.dir_pin}
                            onChange={(e) => updateChannelField(channel.id, 'dir_pin', parseNumericInput(e.target.value))}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`en_${channel.id}`} className="text-xs text-muted-foreground">EN</Label>
                          <Input
                            id={`en_${channel.id}`}
                            type="number"
                            className="h-8 text-sm tabular-nums"
                            value={channel.en_pin}
                            onChange={(e) => updateChannelField(channel.id, 'en_pin', parseNumericInput(e.target.value))}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`step_${channel.id}`} className="text-xs text-muted-foreground">STEP</Label>
                          <Input
                            id={`step_${channel.id}`}
                            type="number"
                            className="h-8 text-sm tabular-nums"
                            value={channel.step_pin}
                            onChange={(e) => updateChannelField(channel.id, 'step_pin', parseNumericInput(e.target.value))}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`ustep_${channel.id}`} className="text-xs text-muted-foreground">μstep</Label>
                          <Select
                            value={String(channel.micro_steps)}
                            onValueChange={(v) => updateChannelField(channel.id, 'micro_steps', Number(v))}
                          >
                            <SelectTrigger id={`ustep_${channel.id}`} className="h-8 text-sm tabular-nums">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MICROSTEP_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={String(opt)}>
                                  {opt} → {getMaxRpmForMicrosteps(opt)} RPM
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Validation error */}
              {validationErrors.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{validationErrors[0]}</span>
                </div>
              )}

              {/* Save / Reset footer */}
              <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                <Button
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={isLoading || isSaving || validationErrors.length > 0 || !isDirty}
                >
                  <Save className="size-3.5" data-icon="inline-start" />
                  {isSaving ? 'Saving...' : 'Save & reload'}
                </Button>
                <Button variant="outline" size="sm" onClick={resetDraft} disabled={!isDirty || isSaving || initialConfig === null}>
                  Reset
                </Button>
                {guidedMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchParams({});
                      navigate('/onboarding');
                    }}
                  >
                    Return to onboarding
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default BoardPage;
