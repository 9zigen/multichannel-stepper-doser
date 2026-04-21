import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HardDriveDownload,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  getBoardConfig,
  BoardConfigState,
  getSettings,
  SettingsState,
  restartDevice,
} from '@/lib/api.ts';
import {
  applyImport,
  ApplyResult,
  buildExport,
  checkVersion,
  CONFIG_EXPORT_VERSION,
  ConfigExport,
  downloadExport,
  ImportSection,
  parseImportFile,
} from '@/lib/config-export.ts';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// ─── Section metadata ─────────────────────────────────────────────────────────

const SECTION_META: Record<
  ImportSection,
  { label: string; description: string; requiresRestart: boolean }
> = {
  networks: {
    label: 'Network configurations',
    description: 'Wi-Fi, Ethernet and other interfaces',
    requiresRestart: true,
  },
  services: {
    label: 'Identity & services',
    description: 'Hostname, NTP, MQTT, OTA URL',
    requiresRestart: false,
  },
  board: {
    label: 'Board configuration',
    description: 'UART, channel wiring, peripherals',
    requiresRestart: true,
  },
  pumps: {
    label: 'Pumps, schedules & aging',
    description: 'Names, calibration, schedules, wear thresholds',
    requiresRestart: false,
  },
};

const ALL_SECTIONS: ImportSection[] = ['networks', 'services', 'board', 'pumps'];

// ─── Component ────────────────────────────────────────────────────────────────

const BackupPage: React.FC = (): React.ReactElement => {
  const status = useAppStore((state: AppStoreState) => state.status);

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ConfigExport | null>(null);
  const [selected, setSelected] = useState<Set<ImportSection>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [applyResults, setApplyResults] = useState<ApplyResult[] | null>(null);

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const [settings, board] = await Promise.all([
        getSettings<SettingsState>(),
        getBoardConfig<BoardConfigState>(),
      ]);
      const data = buildExport(settings, board, status);
      downloadExport(data);
      toast.success('Configuration exported successfully.');
    } catch {
      toast.error('Failed to fetch configuration for export.');
    } finally {
      setIsExporting(false);
    }
  };

  // ── File handling ───────────────────────────────────────────────────────────

  const processFile = async (file: File) => {
    if (!file.name.endsWith('.json')) {
      setParseError('Only .json files are accepted.');
      return;
    }
    setIsParsing(true);
    setParseError(null);
    setParsed(null);
    setApplyResults(null);
    try {
      const data = await parseImportFile(file);
      setParsed(data);
      // Pre-select all sections present in the file
      const available = ALL_SECTIONS.filter((s) => data[s] !== undefined);
      setSelected(new Set(available));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Unknown parse error.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    // Reset so the same file can be re-selected after clearing
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void processFile(file);
  };

  // ── Import apply ─────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!parsed || selected.size === 0) return;
    setIsApplying(true);
    setApplyResults(null);
    try {
      const results = await applyImport(parsed, [...selected]);
      setApplyResults(results);
      const failed = results.filter((r) => !r.success);
      if (failed.length === 0) {
        toast.success(`${results.length} section${results.length > 1 ? 's' : ''} imported successfully.`);
      } else {
        toast.error(`${failed.length} section${failed.length > 1 ? 's' : ''} failed to import.`);
      }
    } catch {
      toast.error('Import failed unexpectedly.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleRestart = async () => {
    try {
      await restartDevice();
      toast.success('Restart command sent.');
    } catch {
      toast.error('Failed to send restart command.');
    }
  };

  const clearImport = () => {
    setParsed(null);
    setParseError(null);
    setSelected(new Set());
    setApplyResults(null);
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const versionStatus = parsed ? checkVersion(parsed.version) : null;
  const availableSections = parsed ? ALL_SECTIONS.filter((s) => parsed[s] !== undefined) : [];
  const needsRestart =
    applyResults !== null &&
    applyResults.some((r) => r.success && SECTION_META[r.section].requiresRestart);

  const toggleSection = (section: ImportSection) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 py-2 md:py-3">
      <section className="mx-auto w-full max-w-screen-2xl px-3">
        <div className="grid gap-4 lg:grid-cols-2">

          {/* ── Export card ─────────────────────────────────────────────────── */}
          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <HardDriveDownload className="size-4 text-muted-foreground" />
                <CardTitle className="text-lg">Export configuration</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* What's included */}
              <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Included
                </div>
                <div className="flex flex-col gap-1.5">
                  {ALL_SECTIONS.map((s) => (
                    <div key={s} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                      <span className="font-medium">{SECTION_META[s].label}</span>
                      <span className="text-muted-foreground">— {SECTION_META[s].description}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* What's excluded */}
              <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Excluded
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    { label: 'Auth credentials', note: 'username & password — never exported' },
                    { label: 'Runtime counters', note: 'running hours, tank fill level' },
                    { label: 'Current time', note: 'date & time are device-local' },
                  ].map(({ label, note }) => (
                    <div key={label} className="flex items-center gap-2 text-sm">
                      <XCircle className="size-3.5 shrink-0 text-muted-foreground/60" />
                      <span className="font-medium">{label}</span>
                      <span className="text-muted-foreground">— {note}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => void handleExport()}
                disabled={isExporting}
                className="self-start"
              >
                <Download className="size-3.5" data-icon="inline-start" />
                {isExporting ? 'Fetching…' : 'Export configuration'}
              </Button>
            </CardContent>
          </Card>

          {/* ── Import card ─────────────────────────────────────────────────── */}
          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Upload className="size-4 text-muted-foreground" />
                  <CardTitle className="text-lg">Import configuration</CardTitle>
                </div>
                {parsed && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearImport}>
                    Clear
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">

              {/* Drop zone — hidden once a file is parsed */}
              {!parsed && (
                <div
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/50 bg-secondary/5 px-6 py-8 text-center transition-colors',
                    isDragging && 'border-primary/50 bg-primary/5',
                    isParsing && 'pointer-events-none opacity-60',
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <Upload className="size-8 text-muted-foreground/50" />
                  <div>
                    <p className="text-sm font-medium">
                      {isParsing ? 'Parsing…' : 'Drop a backup file here'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      or click to choose a <span className="font-mono">.json</span> file
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                </div>
              )}

              {/* Parse error */}
              {parseError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Parsed file summary */}
              {parsed && (
                <div className="flex flex-col gap-3">
                  {/* File info */}
                  <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      File info
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      <span className="text-muted-foreground">Format version</span>
                      <div className="flex items-center gap-1.5">
                        <span className="tabular-nums font-mono">{parsed.version}</span>
                        {versionStatus === 'older' && (
                          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-500 text-xs">
                            older format
                          </Badge>
                        )}
                        {versionStatus === 'newer' && (
                          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-500 text-xs">
                            newer format
                          </Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground">Exported</span>
                      <span className="tabular-nums">
                        {new Date(parsed.exported_at).toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">Firmware</span>
                      <span className="font-mono text-xs">{parsed.device_info.firmware_version}</span>
                      <span className="text-muted-foreground">Hardware</span>
                      <span className="font-mono text-xs">{parsed.device_info.hardware_version}</span>
                    </div>
                  </div>

                  {/* Version warning */}
                  {versionStatus !== 'ok' && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>
                        {versionStatus === 'older'
                          ? `This file uses an older format (v${parsed.version}). Some fields may be missing — review before importing.`
                          : `This file uses a newer format (v${parsed.version}) than supported (v${CONFIG_EXPORT_VERSION}). Consider updating firmware first.`}
                      </span>
                    </div>
                  )}

                  {/* Section selection */}
                  <div className="rounded-lg border border-border/40 bg-secondary/10 p-3">
                    <div className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Select sections to import
                    </div>
                    <div className="flex flex-col gap-2">
                      {ALL_SECTIONS.map((section) => {
                        const available = availableSections.includes(section);
                        const result = applyResults?.find((r) => r.section === section);
                        return (
                          <div key={section} className={cn('flex items-start gap-2.5', !available && 'opacity-40')}>
                            <Checkbox
                              id={`section-${section}`}
                              checked={selected.has(section)}
                              disabled={!available || isApplying || applyResults !== null}
                              onCheckedChange={() => toggleSection(section)}
                              className="mt-0.5"
                            />
                            <Label
                              htmlFor={`section-${section}`}
                              className={cn('flex flex-1 cursor-pointer flex-col gap-0.5', !available && 'cursor-not-allowed')}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium leading-none">
                                  {SECTION_META[section].label}
                                </span>
                                {!available && (
                                  <span className="text-xs text-muted-foreground">(not in file)</span>
                                )}
                                {SECTION_META[section].requiresRestart && available && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 border-border/50">
                                    needs restart
                                  </Badge>
                                )}
                                {result && (
                                  result.success
                                    ? <CheckCircle2 className="size-3.5 text-green-500" />
                                    : <XCircle className="size-3.5 text-destructive" />
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {result?.error ?? SECTION_META[section].description}
                              </span>
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Restart recommendation */}
                  {needsRestart && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm text-amber-500">
                        <AlertTriangle className="size-4 shrink-0" />
                        <span>Network or board config changed — a restart is recommended.</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 text-xs"
                        onClick={() => void handleRestart()}
                      >
                        Restart now
                      </Button>
                    </div>
                  )}

                  {/* Import button — hidden after apply */}
                  {applyResults === null && (
                    <Button
                      size="sm"
                      onClick={() => void handleImport()}
                      disabled={isApplying || selected.size === 0}
                      className="self-start"
                    >
                      <Upload className="size-3.5" data-icon="inline-start" />
                      {isApplying
                        ? 'Importing…'
                        : `Import ${selected.size} section${selected.size !== 1 ? 's' : ''}`}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </section>
    </div>
  );
};

export default BackupPage;
