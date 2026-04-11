import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cable, CircuitBoard, RotateCw, Save } from 'lucide-react';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const parseNumericInput = (value: string): number => {
  if (value.trim() === '') {
    return 0;
  }

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
    if (!allPins.has(pin)) {
      allPins.set(pin, []);
    }
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
    if (uses.length < 2) {
      return;
    }

    const nonEnUses = uses.filter((use) => !use.endsWith(' EN'));
    const enUses = uses.filter((use) => use.endsWith(' EN'));
    if (nonEnUses.length === 0 && enUses.length > 1) {
      return;
    }

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
      } catch (error) {
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
        channel.id === channelId ? { ...channel, [field]: value } : channel
      ),
    }));
  };

  const resetDraft = () => {
    if (initialConfig) {
      setConfig(initialConfig);
    }
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
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-6">
      <section className="container grid gap-8 px-4 md:px-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">Board Overview</CardTitle>
                <CardDescription>
                  Configure shared TMC2209 transport, per-channel wiring, and live hardware limits from one page.
                </CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={() => setSearchParams({ guided: '1' })}>
                Run guided setup
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {guidedMode ? (
              <Alert className="p-4">
                <CircuitBoard />
                <AlertTitle>Guided board setup</AlertTitle>
                <AlertDescription>
                  Review UART pins, active channels, and per-channel wiring. Save when the hardware matches reality, then
                  return to the main app.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <CircuitBoard className="size-4 text-muted-foreground" />
                  Active channels
                </div>
                <Badge variant="secondary">{config.motors_num}</Badge>
              </div>

              <div className="grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>UART bus</span>
                  <Badge variant="outline">UART{config.uart}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>TX / RX pins</span>
                  <Badge variant="outline">
                    {config.tx_pin} / {config.rx_pin}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Shared EN reuse</span>
                  <Badge variant="secondary">Allowed</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Runtime apply mode</span>
                  <Badge variant="default">Live reload</Badge>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 text-sm">
              <div className="mb-2 font-medium">Speed guardrail</div>
                  <div className="text-muted-foreground">
                Max RPM scales with microstep resolution: 256 = 30 RPM, 128 = 60 RPM, 64 = 120 RPM, and so on. The UI
                mirrors the firmware limit so operators see it before saving.
              </div>
            </div>

            <Alert className={cn('p-4', validationErrors.length > 0 && 'border-destructive/50')}>
              <AlertTriangle />
              <AlertTitle>{validationErrors.length > 0 ? 'Validation required' : 'Configuration looks consistent'}</AlertTitle>
              <AlertDescription>
                {validationErrors.length > 0
                  ? validationErrors[0]
                  : 'Duplicate enable pins are accepted, but UART and step/dir assignments must remain conflict-free.'}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Shared Driver Settings</CardTitle>
              <CardDescription>These values are common to all active TMC2209 channels on the board.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Field>
                    <FieldLabel htmlFor="uart">UART peripheral</FieldLabel>
                    <FieldContent>
                      <Select value={String(config.uart)} onValueChange={(value) => updateSharedField('uart', Number(value))}>
                        <SelectTrigger id="uart">
                          <SelectValue placeholder="Select UART" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">UART0</SelectItem>
                          <SelectItem value="1">UART1</SelectItem>
                          <SelectItem value="2">UART2</SelectItem>
                        </SelectContent>
                      </Select>
                      <FieldDescription>Shared serial bus used by all drivers.</FieldDescription>
                    </FieldContent>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="tx_pin">TX pin</FieldLabel>
                    <FieldContent>
                      <Input
                        id="tx_pin"
                        type="number"
                        value={config.tx_pin}
                        onChange={(event) => updateSharedField('tx_pin', parseNumericInput(event.target.value))}
                      />
                      <FieldDescription>Controller transmit pin for driver UART.</FieldDescription>
                    </FieldContent>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="rx_pin">RX pin</FieldLabel>
                    <FieldContent>
                      <Input
                        id="rx_pin"
                        type="number"
                        value={config.rx_pin}
                        onChange={(event) => updateSharedField('rx_pin', parseNumericInput(event.target.value))}
                      />
                      <FieldDescription>Controller receive pin for driver UART.</FieldDescription>
                    </FieldContent>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="motors_num">Active channels</FieldLabel>
                    <FieldContent>
                      <Select
                        value={String(config.motors_num)}
                        onValueChange={(value) => updateSharedField('motors_num', Number(value))}
                      >
                        <SelectTrigger id="motors_num">
                          <SelectValue placeholder="Select active channels" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 channel</SelectItem>
                          <SelectItem value="2">2 channels</SelectItem>
                          <SelectItem value="3">3 channels</SelectItem>
                          <SelectItem value="4">4 channels</SelectItem>
                        </SelectContent>
                      </Select>
                      <FieldDescription>Only active channels are initialized and validated for runtime use.</FieldDescription>
                    </FieldContent>
                  </Field>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Channel Wiring</CardTitle>
              <CardDescription>All four channel slots stay visible so inactive outputs can be prepared ahead of time.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {config.channels.map((channel, index) => {
                  const isActive = channel.id < config.motors_num;

                  return (
                    <div
                      key={channel.id}
                      className={cn(
                        'animate-fade-in-up rounded-xl border bg-card p-4 transition-opacity',
                        !isActive && 'opacity-60'
                      )}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                            <Cable className="size-4 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="font-medium">Channel {channel.id + 1}</div>
                            <div className="text-sm text-muted-foreground">
                              {isActive ? 'Initialized at runtime' : 'Stored but currently inactive'}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant={isActive ? 'default' : 'outline'}>{isActive ? 'Active' : 'Inactive'}</Badge>
                          <Badge variant="secondary">
                            <RotateCw data-icon="inline-start" />
                            Max {getChannelMaxRpm(channel)} RPM
                          </Badge>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <Field>
                          <FieldLabel htmlFor={`dir_pin_${channel.id}`}>DIR pin</FieldLabel>
                          <FieldContent>
                            <Input
                              id={`dir_pin_${channel.id}`}
                              type="number"
                              value={channel.dir_pin}
                              onChange={(event) =>
                                updateChannelField(channel.id, 'dir_pin', parseNumericInput(event.target.value))
                              }
                            />
                          </FieldContent>
                        </Field>

                        <Field>
                          <FieldLabel htmlFor={`en_pin_${channel.id}`}>EN pin</FieldLabel>
                          <FieldContent>
                            <Input
                              id={`en_pin_${channel.id}`}
                              type="number"
                              value={channel.en_pin}
                              onChange={(event) =>
                                updateChannelField(channel.id, 'en_pin', parseNumericInput(event.target.value))
                              }
                            />
                            <FieldDescription>Shared enable pins are allowed across channels.</FieldDescription>
                          </FieldContent>
                        </Field>

                        <Field>
                          <FieldLabel htmlFor={`step_pin_${channel.id}`}>STEP pin</FieldLabel>
                          <FieldContent>
                            <Input
                              id={`step_pin_${channel.id}`}
                              type="number"
                              value={channel.step_pin}
                              onChange={(event) =>
                                updateChannelField(channel.id, 'step_pin', parseNumericInput(event.target.value))
                              }
                            />
                          </FieldContent>
                        </Field>

                        <Field>
                          <FieldLabel htmlFor={`micro_steps_${channel.id}`}>Microsteps</FieldLabel>
                          <FieldContent>
                            <Select
                              value={String(channel.micro_steps)}
                              onValueChange={(value) => updateChannelField(channel.id, 'micro_steps', Number(value))}
                            >
                              <SelectTrigger id={`micro_steps_${channel.id}`}>
                                <SelectValue placeholder="Select microsteps" />
                              </SelectTrigger>
                              <SelectContent>
                                {MICROSTEP_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={String(option)}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FieldDescription>
                              {channel.micro_steps === 256
                                ? '256 microsteps forces a 30 RPM firmware cap.'
                                : `Max RPM scales to ${getMaxRpmForMicrosteps(channel.micro_steps)} at this microstep setting.`}
                            </FieldDescription>
                          </FieldContent>
                        </Field>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Apply Changes</CardTitle>
              <CardDescription>Saving posts the new board model to the backend and triggers live stepper reinitialization.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {validationErrors.length > 0 ? (
                <Alert className="border-destructive/50">
                  <AlertTriangle />
                  <AlertTitle>Resolve validation issues first</AlertTitle>
                  <AlertDescription>{validationErrors.join(' ')}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => void handleSave()} disabled={isLoading || isSaving || validationErrors.length > 0 || !isDirty}>
                  <Save data-icon="inline-start" />
                  {isSaving ? 'Saving...' : 'Save and reload drivers'}
                </Button>
                <Button variant="outline" onClick={resetDraft} disabled={!isDirty || isSaving || initialConfig === null}>
                  Reset changes
                </Button>
                {guidedMode ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchParams({});
                      navigate('/onboarding');
                    }}
                  >
                    Return to onboarding
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default BoardPage;
