import React, { useRef, useState } from 'react';
import { CheckCircle2, Clock3, Cpu, FileArchive, FolderOpen, ShieldCheck, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { DeviceMaintenanceActions } from '@/components/device-maintenance-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { uploadFirmware } from '@/lib/api.ts';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const FirmwarePage: React.FC = (): React.ReactElement => {
  const deviceStatus = useAppStore((state: AppStoreState) => state.status);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const isUploaded = progress === 100 && !isUploading;

  const selectFile = (nextFile: File | null) => {
    setFile(nextFile);
    setProgress(0);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    selectFile(selectedFile);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const droppedFile = event.dataTransfer.files?.[0] ?? null;
    if (droppedFile) {
      selectFile(droppedFile);
    }
  };

  const handleUpload = async () => {
    if (!file || isUploading) {
      return;
    }

    try {
      setIsUploading(true);
      setProgress(0);

      await uploadFirmware(file, (event) => {
        const nextProgress = event?.total ? Math.round((100 * event.loaded) / event.total) : 0;
        setProgress(nextProgress);
      });

      toast.success(`Firmware uploaded: ${file.name}`);
    } catch (error) {
      setProgress(0);
      toast.error('Firmware upload failed');
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  const clearSelection = () => {
    selectFile(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-8">
      <section className="container grid gap-8 px-4 md:px-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="shadow-none animate-in fade-in zoom-in">
          <CardHeader>
            <CardTitle className="text-xl">Firmware Overview</CardTitle>
            <CardDescription>
              Inspect build information, perform a manual upload, and keep recovery actions close at hand.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <Cpu className="size-4 text-muted-foreground" />
                  Installed build
                </div>
                <Badge variant="secondary">{deviceStatus.hardware_version || 'Unknown hardware'}</Badge>
              </div>
              <div className="grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Firmware version</span>
                  <Badge variant="outline">{deviceStatus.firmware_version || 'Unavailable'}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Build date</span>
                  <span className="font-medium text-foreground">{deviceStatus.firmware_date || 'Unavailable'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Last reboot reason</span>
                  <Badge variant="secondary">{deviceStatus.last_reboot_reason || 'Unknown'}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Wi-Fi operating mode</span>
                  <Badge variant={deviceStatus.wifi_mode === 'AP+STA' ? 'default' : 'outline'}>
                    {deviceStatus.wifi_mode || 'Unavailable'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 text-sm">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <Clock3 className="size-4 text-muted-foreground" />
                Update guidance
              </div>
              <div className="grid gap-2 text-muted-foreground">
                <div>Use firmware upload for local maintenance or recovery updates.</div>
                <div>Restart after service, network, or firmware changes to verify the device returns cleanly.</div>
                <div>
                  During commissioning, simultaneous AP + Station mode keeps a local fallback path available while the
                  device joins your router.
                </div>
              </div>
            </div>

            <Alert className="p-4">
              <ShieldCheck />
              <AlertTitle>Safe update flow</AlertTitle>
              <AlertDescription>
                Keep the browser open until upload completes. A restart is expected after firmware changes, and the
                controller may be briefly unavailable while networking and services reconnect.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="w-full shadow-none animate-in fade-in zoom-in">
            <CardHeader>
              <CardTitle>Manual Firmware Upload</CardTitle>
              <CardDescription>Upload a binary package directly to the device on your local network.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-6">
                <Field>
                  <FieldContent className="gap-3">
                    <FieldLabel htmlFor="firmware">Firmware binary</FieldLabel>
                    <FieldDescription>
                      Drop a firmware image here or browse from disk. The file will be uploaded directly to the device.
                    </FieldDescription>

                    <label
                      htmlFor="firmware"
                      onDragEnter={() => setIsDragging(true)}
                      onDragLeave={() => setIsDragging(false)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={handleDrop}
                      className={cn(
                        'group flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/30 p-6 text-center transition-colors',
                        'hover:border-primary/50 hover:bg-muted/60',
                        isDragging && 'border-primary bg-primary/5',
                        file && 'items-stretch text-left'
                      )}
                    >
                      <Input
                        ref={inputRef}
                        id="firmware"
                        type="file"
                        className="sr-only"
                        onChange={handleFileChange}
                        accept=".bin,.ota"
                      />

                      {!file ? (
                        <>
                          <div className="flex size-12 items-center justify-center rounded-full bg-background shadow-xs">
                            <Upload className="text-muted-foreground" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">Drop firmware here</span>
                            <span className="text-sm text-muted-foreground">
                              or click to browse `.bin` and `.ota` files
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col gap-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <div className="flex size-10 items-center justify-center rounded-lg bg-background shadow-xs">
                                {isUploaded ? (
                                  <CheckCircle2 className="text-primary" />
                                ) : (
                                  <FileArchive className="text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="font-medium">{file.name}</span>
                                <span className="text-sm text-muted-foreground">{formatBytes(file.size)}</span>
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="shrink-0"
                              onClick={(event) => {
                                event.preventDefault();
                                clearSelection();
                              }}
                              disabled={isUploading}
                            >
                              <X />
                            </Button>
                          </div>

                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-4 text-sm">
                              <span className="text-muted-foreground">
                                {isUploading
                                  ? 'Uploading firmware...'
                                  : isUploaded
                                    ? 'Upload complete'
                                    : 'Ready to upload'}
                              </span>
                              <span className="font-medium">{progress}%</span>
                            </div>
                            <Progress value={progress} />
                          </div>
                        </div>
                      )}
                    </label>
                  </FieldContent>
                </Field>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => inputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <FolderOpen data-icon="inline-start" />
                    Choose file
                  </Button>
                  <Button type="button" onClick={handleUpload} disabled={!file || isUploading}>
                    {isUploading ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
                    {isUploading ? 'Uploading...' : isUploaded ? 'Upload again' : 'Upload firmware'}
                  </Button>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card className="shadow-none animate-in fade-in zoom-in">
            <CardHeader>
              <CardTitle>Device Recovery</CardTitle>
              <CardDescription>
                Restart the controller after configuration changes or return it to a clean factory state.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                Use restart for normal maintenance. Use factory reset only when you need to wipe saved network and
                service configuration before re-provisioning the device.
              </div>
              <DeviceMaintenanceActions />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default FirmwarePage;
