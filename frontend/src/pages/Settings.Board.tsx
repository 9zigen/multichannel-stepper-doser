import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cable, Check, ChevronDown, CircuitBoard, LayoutTemplate, Network, RotateCw, Save, Zap } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  AdcChannelConfig,
  BoardConfigChannel,
  BoardConfigSaveResponse,
  BoardConfigState,
  getBoardConfig,
  GpioInputConfig,
  GpioOutputConfig,
  GpioPull,
  setBoardConfig,
} from '@/lib/api.ts';
import {
  createEmptyBoardConfig,
  formatI2cAddr,
  getChannelMaxRpm,
  getMaxRpmForMicrosteps,
  MAX_BOARD_CHANNELS,
  MICROSTEP_OPTIONS,
  parseI2cInput,
} from '@/lib/board-config.ts';
import { BOARD_PRESETS, BoardPreset } from '@/lib/board-presets.ts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { BACKEND_SYSTEM_READY_EVENT } from '@/lib/device-events.ts';

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

  if (config.rtc_i2c_addr < 0 || config.rtc_i2c_addr > 0x7f) {
    errors.push('RTC I2C address must be in range 0x00–0x7F.');
  }

  if (config.eeprom_i2c_addr < 0 || config.eeprom_i2c_addr > 0x7f) {
    errors.push('EEPROM I2C address must be in range 0x00–0x7F.');
  }

  if (config.can_tx_pin !== -1 && config.can_rx_pin === -1) {
    errors.push('CAN TX pin is set but CAN RX pin is missing.');
  }

  if (config.can_rx_pin !== -1 && config.can_tx_pin === -1) {
    errors.push('CAN RX pin is set but CAN TX pin is missing.');
  }

  const allPins = new Map<number, string[]>();
  const activeChannels = config.channels.slice(0, config.motors_num);

  const addPinUse = (pin: number, label: string) => {
    if (pin < 0) return;
    if (!allPins.has(pin)) allPins.set(pin, []);
    allPins.get(pin)?.push(label);
  };

  addPinUse(config.tx_pin, 'UART TX');
  addPinUse(config.rx_pin, 'UART RX');

  if (config.can_tx_pin >= 0) addPinUse(config.can_tx_pin, 'CAN TX');
  if (config.can_rx_pin >= 0) addPinUse(config.can_rx_pin, 'CAN RX');

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
  const [presetOpen, setPresetOpen] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<BoardPreset | null>(null);

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

    const handleBackendReady = () => {
      void loadBoardConfig();
    };

    void loadBoardConfig();
    window.addEventListener(BACKEND_SYSTEM_READY_EVENT, handleBackendReady);

    return () => {
      window.removeEventListener(BACKEND_SYSTEM_READY_EVENT, handleBackendReady);
    };
  }, []);

  const validationErrors = useMemo(() => validateBoardConfig(config), [config]);
  const isDirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(initialConfig), [config, initialConfig]);
  const guidedMode = searchParams.get('guided') === '1';

  const applyPreset = (preset: BoardPreset) => {
    if (isDirty) {
      setPendingPreset(preset);
    } else {
      setConfig(preset.config);
      setPresetOpen(false);
      toast.success(`Preset "${preset.name}" applied.`);
    }
  };

  const confirmApplyPreset = () => {
    if (!pendingPreset) return;
    setConfig(pendingPreset.config);
    setPendingPreset(null);
    setPresetOpen(false);
    toast.success(`Preset "${pendingPreset.name}" applied.`);
  };

  const updateSharedField = (
    field: keyof Omit<BoardConfigState, 'channels' | 'adc_channels' | 'gpio_inputs' | 'gpio_outputs'>,
    value: number,
  ) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const updateAdcChannel = (id: number, field: keyof AdcChannelConfig, value: number | boolean) => {
    setConfig((current) => ({
      ...current,
      adc_channels: current.adc_channels.map((ch) => ch.id === id ? { ...ch, [field]: value } : ch),
    }));
  };

  const updateGpioInput = (id: number, field: keyof GpioInputConfig, value: number | boolean) => {
    setConfig((current) => ({
      ...current,
      gpio_inputs: current.gpio_inputs.map((inp) => inp.id === id ? { ...inp, [field]: value } : inp),
    }));
  };

  const updateGpioOutput = (id: number, field: keyof GpioOutputConfig, value: number | boolean) => {
    setConfig((current) => ({
      ...current,
      gpio_outputs: current.gpio_outputs.map((out) => out.id === id ? { ...out, [field]: value } : out),
    }));
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
    setPendingPreset(null);
  };

  const handleSave = async () => {
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    try {
      setIsSaving(true);
      const savedConfig = await setBoardConfig<BoardConfigSaveResponse>(config);
      setConfig(savedConfig);
      setInitialConfig(savedConfig);
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

                  {/* Preset picker */}
                  <Popover open={presetOpen} onOpenChange={(open) => { setPresetOpen(open); if (!open) setPendingPreset(null); }}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs">
                        <LayoutTemplate className="size-3.5" />
                        Presets
                        <ChevronDown className="size-3 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80 p-2">
                      {pendingPreset ? (
                        <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                          <div className="flex items-start gap-2 text-sm">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                            <span className="text-foreground">
                              You have unsaved changes. Applying <span className="font-medium">{pendingPreset.name}</span> will discard them.
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 flex-1 text-xs" onClick={confirmApplyPreset}>
                              Apply anyway
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => setPendingPreset(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <div className="px-2 pb-1 pt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Hardware presets
                          </div>
                          {BOARD_PRESETS.map((preset) => {
                            const isActive = JSON.stringify(config) === JSON.stringify(preset.config);
                            return (
                              <button
                                key={preset.id}
                                onClick={() => applyPreset(preset)}
                                className={cn(
                                  'flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-secondary/60',
                                  isActive && 'bg-primary/10 text-primary',
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium">{preset.name}</span>
                                  {isActive && <Check className="size-3.5 shrink-0" />}
                                </div>
                                <span className="text-xs text-muted-foreground">{preset.description}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
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

              {/* I2C Bus */}
              <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">I2C Bus</div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="i2c_sda_pin" className="text-xs text-muted-foreground">SDA Pin</Label>
                    <Input id="i2c_sda_pin" type="number" className="h-8 text-sm tabular-nums"
                      value={config.i2c_sda_pin}
                      onChange={(e) => updateSharedField('i2c_sda_pin', parseNumericInput(e.target.value))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="i2c_scl_pin" className="text-xs text-muted-foreground">SCL Pin</Label>
                    <Input id="i2c_scl_pin" type="number" className="h-8 text-sm tabular-nums"
                      value={config.i2c_scl_pin}
                      onChange={(e) => updateSharedField('i2c_scl_pin', parseNumericInput(e.target.value))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="rtc_i2c_addr" className="text-xs text-muted-foreground">RTC Addr</Label>
                    <Input id="rtc_i2c_addr" type="text" inputMode="text"
                      className="h-8 text-sm tabular-nums font-mono"
                      value={formatI2cAddr(config.rtc_i2c_addr)} placeholder="0x6F"
                      onChange={(e) => updateSharedField('rtc_i2c_addr', parseI2cInput(e.target.value))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="eeprom_i2c_addr" className="text-xs text-muted-foreground">EEPROM Addr</Label>
                    <Input id="eeprom_i2c_addr" type="text" inputMode="text"
                      className="h-8 text-sm tabular-nums font-mono"
                      value={formatI2cAddr(config.eeprom_i2c_addr)} placeholder="0x50"
                      onChange={(e) => updateSharedField('eeprom_i2c_addr', parseI2cInput(e.target.value))} />
                  </div>
                </div>
              </div>

              {/* ADC Channels */}
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-1">ADC Channels</div>
                {config.adc_channels.map((ch) => (
                  <div key={ch.id} className={cn(
                    'rounded-lg border border-border/40 bg-secondary/10 p-3 transition-opacity',
                    !ch.enabled && 'opacity-60',
                  )}>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="flex size-6 items-center justify-center rounded bg-secondary/50">
                          <Zap className="size-3 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium">ADC {ch.id + 1}</span>
                        <Badge variant={ch.enabled ? 'default' : 'outline'} className="text-xs">
                          {ch.enabled ? 'Active' : 'Idle'}
                        </Badge>
                      </div>
                      <div className="ml-auto flex flex-wrap items-center gap-3">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`adc_pin_${ch.id}`} className="text-xs text-muted-foreground">Pin</Label>
                          <Input id={`adc_pin_${ch.id}`} type="number" className="h-8 w-24 text-sm tabular-nums"
                            value={ch.pin}
                            onChange={(e) => updateAdcChannel(ch.id, 'pin', parseNumericInput(e.target.value))} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Enabled</Label>
                          <div className="flex h-8 items-center">
                            <Switch checked={ch.enabled} onCheckedChange={(v) => updateAdcChannel(ch.id, 'enabled', v)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Digital Inputs */}
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-1">Digital Inputs</div>
                {config.gpio_inputs.map((inp) => (
                  <div key={inp.id} className={cn(
                    'rounded-lg border border-border/40 bg-secondary/10 p-3 transition-opacity',
                    !inp.enabled && 'opacity-60',
                  )}>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="flex size-6 items-center justify-center rounded bg-secondary/50">
                          <Zap className="size-3 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium">IN {inp.id + 1}</span>
                        <Badge variant={inp.enabled ? 'default' : 'outline'} className="text-xs">
                          {inp.enabled ? 'Active' : 'Idle'}
                        </Badge>
                      </div>
                      <div className="ml-auto flex flex-wrap items-center gap-3">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`in_pin_${inp.id}`} className="text-xs text-muted-foreground">Pin</Label>
                          <Input id={`in_pin_${inp.id}`} type="number" className="h-8 w-24 text-sm tabular-nums"
                            value={inp.pin}
                            onChange={(e) => updateGpioInput(inp.id, 'pin', parseNumericInput(e.target.value))} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`in_pull_${inp.id}`} className="text-xs text-muted-foreground">Pull</Label>
                          <Select value={String(inp.pull)} onValueChange={(v) => updateGpioInput(inp.id, 'pull', Number(v))}>
                            <SelectTrigger id={`in_pull_${inp.id}`} className="h-8 w-32 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={String(GpioPull.None)}>None</SelectItem>
                              <SelectItem value={String(GpioPull.Up)}>Pull-up</SelectItem>
                              <SelectItem value={String(GpioPull.Down)}>Pull-down</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`in_active_${inp.id}`} className="text-xs text-muted-foreground">Active</Label>
                          <Select value={String(inp.active_level)} onValueChange={(v) => updateGpioInput(inp.id, 'active_level', Number(v))}>
                            <SelectTrigger id={`in_active_${inp.id}`} className="h-8 w-28 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">High (1)</SelectItem>
                              <SelectItem value="0">Low (0)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Enabled</Label>
                          <div className="flex h-8 items-center">
                            <Switch checked={inp.enabled} onCheckedChange={(v) => updateGpioInput(inp.id, 'enabled', v)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Digital Outputs */}
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-1">Digital Outputs</div>
                {config.gpio_outputs.map((out) => (
                  <div key={out.id} className={cn(
                    'rounded-lg border border-border/40 bg-secondary/10 p-3 transition-opacity',
                    !out.enabled && 'opacity-60',
                  )}>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="flex size-6 items-center justify-center rounded bg-secondary/50">
                          <Zap className="size-3 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium">OUT {out.id + 1}</span>
                        <Badge variant={out.enabled ? 'default' : 'outline'} className="text-xs">
                          {out.enabled ? 'Active' : 'Idle'}
                        </Badge>
                      </div>
                      <div className="ml-auto flex flex-wrap items-center gap-3">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`out_pin_${out.id}`} className="text-xs text-muted-foreground">Pin</Label>
                          <Input id={`out_pin_${out.id}`} type="number" className="h-8 w-24 text-sm tabular-nums"
                            value={out.pin}
                            onChange={(e) => updateGpioOutput(out.id, 'pin', parseNumericInput(e.target.value))} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`out_active_${out.id}`} className="text-xs text-muted-foreground">Active</Label>
                          <Select value={String(out.active_level)} onValueChange={(v) => updateGpioOutput(out.id, 'active_level', Number(v))}>
                            <SelectTrigger id={`out_active_${out.id}`} className="h-8 w-28 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">High (1)</SelectItem>
                              <SelectItem value="0">Low (0)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Enabled</Label>
                          <div className="flex h-8 items-center">
                            <Switch checked={out.enabled} onCheckedChange={(v) => updateGpioOutput(out.id, 'enabled', v)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CAN Bus */}
              <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">CAN Bus</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="can_tx_pin" className="text-xs text-muted-foreground">TX Pin</Label>
                    <Input id="can_tx_pin" type="number" className="h-8 text-sm tabular-nums"
                      value={config.can_tx_pin < 0 ? '' : config.can_tx_pin}
                      placeholder="-1 (disabled)"
                      onChange={(e) => { const v = parseNumericInput(e.target.value); updateSharedField('can_tx_pin', v || -1); }} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="can_rx_pin" className="text-xs text-muted-foreground">RX Pin</Label>
                    <Input id="can_rx_pin" type="number" className="h-8 text-sm tabular-nums"
                      value={config.can_rx_pin < 0 ? '' : config.can_rx_pin}
                      placeholder="-1 (disabled)"
                      onChange={(e) => { const v = parseNumericInput(e.target.value); updateSharedField('can_rx_pin', v || -1); }} />
                  </div>
                </div>
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
