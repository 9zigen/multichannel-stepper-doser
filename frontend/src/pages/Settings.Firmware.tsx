import React, { useRef, useState } from 'react';
import { CheckCircle2, Cpu, FileArchive, FolderOpen, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { DeviceMaintenanceActions } from '@/components/device-maintenance-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { uploadFirmware } from '@/lib/api.ts';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
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
    selectFile(event.target.files?.[0] ?? null);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0] ?? null;
    if (droppedFile) selectFile(droppedFile);
  };

  const handleUpload = async () => {
    if (!file || isUploading) return;
    try {
      setIsUploading(true);
      setProgress(0);
      await uploadFirmware(file, (event) => {
        setProgress(event?.total ? Math.round((100 * event.loaded) / event.total) : 0);
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
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-4 py-2 md:py-3">
      <section className="mx-auto w-full max-w-screen-2xl px-3">
        <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Cpu className="size-4 text-muted-foreground" />
                <CardTitle className="text-lg">Firmware</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5 tabular-nums">
                  {deviceStatus.firmware_version || 'Unknown'}
                </Badge>
                <Badge variant="secondary" className="tabular-nums">
                  {deviceStatus.firmware_date || 'No build date'}
                </Badge>
                <Badge variant="secondary">
                  {deviceStatus.hardware_version || 'Unknown HW'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {/* Upload zone */}
            <label
              htmlFor="firmware"
              onDragEnter={() => setIsDragging(true)}
              onDragLeave={() => setIsDragging(false)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className={cn(
                'group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-secondary/10 p-5 text-center transition-colors',
                'hover:border-primary/40 hover:bg-primary/5',
                isDragging && 'border-primary bg-primary/5',
                file && 'items-stretch text-left',
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
                  <div className="flex size-10 items-center justify-center rounded-md bg-secondary/50">
                    <Upload className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Drop firmware binary here</span>
                    <span className="text-xs text-muted-foreground">
                      .bin or .ota — or click to browse
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 items-center justify-center rounded-md bg-secondary/50">
                        {isUploaded ? (
                          <CheckCircle2 className="size-4 text-primary" />
                        ) : (
                          <FileArchive className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{file.name}</span>
                        <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      onClick={(e) => { e.preventDefault(); clearSelection(); }}
                      disabled={isUploading}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {isUploading ? 'Uploading...' : isUploaded ? 'Upload complete' : 'Ready'}
                      </span>
                      <span className="tabular-nums font-medium">{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                </div>
              )}
            </label>

            {/* Upload actions */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
              >
                <FolderOpen className="size-3.5" data-icon="inline-start" />
                Choose file
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleUpload}
                disabled={!file || isUploading}
              >
                {isUploading ? (
                  <Spinner className="size-3.5" data-icon="inline-start" />
                ) : (
                  <Upload className="size-3.5" data-icon="inline-start" />
                )}
                {isUploading ? 'Uploading...' : isUploaded ? 'Upload again' : 'Upload firmware'}
              </Button>
            </div>

            {/* Recovery */}
            <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-3">
              <span className="text-xs text-muted-foreground">
                Restart after updates. Factory reset erases all config.
              </span>
              <DeviceMaintenanceActions />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default FirmwarePage;
