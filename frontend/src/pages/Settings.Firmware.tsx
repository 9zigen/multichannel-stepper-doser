import React, { useRef, useState } from 'react';
import { CheckCircle2, FileArchive, FolderOpen, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
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
      <section className="container flex gap-6 px-6">
        <Card className="w-full shadow-none animate-in fade-in zoom-in">
          <CardHeader>
            <CardTitle>Firmware</CardTitle>
            <CardDescription>Manual firmware upload for direct device updates on the local network.</CardDescription>
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
      </section>
    </div>
  );
};

export default FirmwarePage;
