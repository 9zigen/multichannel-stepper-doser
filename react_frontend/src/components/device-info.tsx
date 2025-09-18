import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card.tsx";

export interface DeviceInfoProps {
    up_time: string
    local_time: string
    free_heap: number
    vcc: number
    board_temperature: number
    wifi_mode: 'STA' | 'AP'
    ip_address: string
    mac_address: string
    mqtt_service: { "enabled": boolean, "connected": boolean }
    ntp_service: { "enabled": boolean, "sync": boolean }
    firmware_version: string
    firmware_date: string
    hardware: string
}

export default function DeviceInfo(props: DeviceInfoProps) {
    return (
      <Card className="w-full shadow-none">
        <CardHeader>
          <CardTitle>Hardware</CardTitle>
          <CardDescription>
            Device info.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col xl:flex-row gap-6 w-full xl:justify-between">
            <div className="flex flex-col">
              <ul>
                <li>Time:               <strong>{ props.local_time }</strong></li>
                <li>Uptime:             <strong>{ props.up_time }</strong></li>
                <li>Power IN:           <strong>{ props.vcc / 1000 } volt.</strong></li>
                <li>Board Temperature:  <strong>{ props.board_temperature / 100 } °C</strong></li>
                <li>MQTT Server:        <strong>{ props.mqtt_service.connected? 'connected' : 'not connected' }</strong></li>
                <li>NTP:                <strong>{ props.ntp_service.sync? 'synced' : 'not synced' }</strong></li>
              </ul>
            </div>
            
            <div className="flex flex-col">
              <ul>
                <li>Firmware:   <strong>{ props.firmware_version } { props.firmware_date }</strong></li>
                <li>Hardware:   <strong>{ props.hardware }</strong></li>
                <li>Free Heap:  <strong>{ props.free_heap }</strong></li>
                <li>WIFI:       <strong>{ props.wifi_mode }</strong></li>
                <li>IP Address: <strong>{ props.ip_address }</strong></li>
                <li>MAC:        <strong>{ props.mac_address }</strong></li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    )
}
