import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';

export interface HardwareInfoProps {
  vcc: number;
  board_temperature: number;
  wifi_mode: 'STA' | 'AP';
  ip_address: string;
  mac_address: string;
  hardware_version: string;
}

export default function HardwareInfo(props: HardwareInfoProps) {
  return (
    <Card className="w-full shadow-none">
      <CardHeader>
        <CardTitle>Hardware</CardTitle>
        <CardDescription>Device info.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col">
          <div className="grid grid-cols-2 gap-1 [&>div:nth-child(2n)]:font-semibold">
            <div>Hardware:</div>
            <div>{props.hardware_version}</div>

            <div>Power IN:</div>
            <div>{props.vcc / 1000} V</div>

            <div>Board °C:</div>
            <div>{props.board_temperature / 100} °C</div>

            <div>WIFI:</div>
            <div>{props.wifi_mode}</div>

            <div>MAC:</div>
            <div>{props.mac_address}</div>

            <div>IP Address:</div>
            <div>{props.ip_address}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
