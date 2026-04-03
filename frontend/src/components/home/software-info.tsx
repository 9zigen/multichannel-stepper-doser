import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';

export interface SoftwareInfoProps {
  up_time: string;
  local_time: string;
  free_heap: number;
  mqtt_service: { enabled: boolean; connected: boolean };
  ntp_service: { enabled: boolean; sync: boolean };
  firmware_version: string;
  firmware_date: string;
}

export default function SoftwareInfo(props: SoftwareInfoProps) {
  return (
    <Card className="w-full shadow-none">
      <CardHeader>
        <CardTitle>Software</CardTitle>
        <CardDescription>Device info.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col">
          <div className="grid grid-cols-2 gap-1 [&>div:nth-child(2n)]:font-semibold">
            <div>Firmware Version:</div>
            <div>{props.firmware_version}</div>

            <div>Firmware Date:</div>
            <div>{props.firmware_date}</div>

            <div>Free Heap:</div>
            <div>{props.free_heap}</div>

            <div>Time:</div>
            <div>{props.local_time}</div>

            <div>Uptime:</div>
            <div>{props.up_time}</div>

            <div>MQTT:</div>
            <div>{props.mqtt_service.enabled ? 'enabled' : 'disabled'}</div>

            <div>NTP:</div>
            <div>{props.ntp_service.enabled ? 'enabled' : 'disabled'}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
