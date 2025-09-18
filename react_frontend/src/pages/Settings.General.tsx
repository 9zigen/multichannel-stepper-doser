import React, {useState} from "react";

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { uploadFirmware } from "@/lib/api.ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";

const GeneralPage: React.FC = (): React.ReactElement => {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number>(0);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };
  
  const handleUpload = async () => {
    if (file) {
      console.log('Uploading file...');
      try {
        const result = await uploadFirmware(file, event => {
          const progress = event?.total? Math.round((100 * event.loaded) / event.total) : 0
          setProgress(progress)
        });
        
        console.log({result});
      } catch (e) {
        console.error(e);
      }
    }
  }
  return (
    <div className="flex flex-col items-center justify-center">
      <section className="flex flex-col items-center justify-center gap-6 w-full sm:w-[400px] xl:w-[600px]">
        <Card className="w-full shadow-none">
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>
              Firmware update, device settings, etc.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="firmware">Firmware binary</Label>
              <Input id="firmware" type="file" onChange={handleFileChange} />
            </div>
            
            <div className="mt-4 w-full flex flex-col grow justify-center">
              <Button
                onClick={handleUpload}
                disabled={progress !== 0 || !file}
              >
                {progress? `Done: ${progress}%` : 'Upload firmware'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default GeneralPage;
