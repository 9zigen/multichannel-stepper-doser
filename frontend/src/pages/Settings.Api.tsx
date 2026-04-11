import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BookText, Cable, RadioTower, ShieldCheck, Webhook } from 'lucide-react';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';

const codeClassName =
  'overflow-x-auto rounded-xl border bg-muted/30 px-4 py-3 font-mono text-[12px] leading-5 text-foreground';

const ApiDocsPage: React.FC = (): React.ReactElement => {
  const services = useAppStore((state: AppStoreState) => state.settings.services);
  const topicBase = services.hostname || 'stepper-doser';

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-6">
      <section className="container grid gap-8 px-4 md:px-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Integration Overview</CardTitle>
            <CardDescription>
              Firmware interfaces grouped by transport so local apps, dashboards, and Home Assistant can integrate
              consistently.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <RadioTower className="size-4 text-muted-foreground" />
                  MQTT topic base
                </div>
                <Badge variant="secondary">{topicBase}</Badge>
              </div>
              <div className="grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>REST API</span>
                  <Badge variant="outline">HTTP JSON</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Realtime</span>
                  <Badge variant="outline">WebSocket</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Automation</span>
                  <Badge variant="outline">MQTT + HA Discovery</Badge>
                </div>
              </div>
            </div>

            <Alert className="p-4">
              <ShieldCheck />
              <AlertTitle>Authentication model</AlertTitle>
              <AlertDescription>
                REST and WebSocket use the current bearer token. MQTT currently assumes trusted LAN broker access and
                uses broker username/password from device settings.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Webhook className="size-5" />
                REST API
              </CardTitle>
              <CardDescription>Primary configuration and control surface used by the Web UI.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <div>
                <div className="mb-2 font-medium">Endpoints</div>
                <div className={codeClassName}>
                  GET /api/status
                  <br />
                  GET /api/settings
                  <br />
                  POST /api/settings
                  <br />
                  POST /api/run
                  <br />
                  POST /api/calibration
                  <br />
                  GET /api/pumps/runtime
                  <br />
                  POST /api/device/restart
                  <br />
                  POST /api/device/factory-reset
                  <br />
                  POST /upload
                </div>
              </div>

              <div>
                <div className="mb-2 font-medium">Manual pump run example</div>
                <div className={codeClassName}>
                  POST /api/run
                  <br />
                  Authorization: Bearer &lt;token&gt;
                  <br />
                  {`{"id":0,"direction":true,"speed":1,"time":1}`}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Cable className="size-5" />
                WebSocket
              </CardTitle>
              <CardDescription>
                Lightweight realtime channel used for connection health and live pump runtime updates.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <div>
                <div className="mb-2 font-medium">Connection</div>
                <div className={codeClassName}>ws://&lt;device-ip&gt;/ws?token=&lt;bearer-token&gt;</div>
              </div>

              <div>
                <div className="mb-2 font-medium">Client heartbeat</div>
                <div className={codeClassName}>{`{"type":"ping"}`}</div>
              </div>

              <div>
                <div className="mb-2 font-medium">Pump runtime push event</div>
                <div className={codeClassName}>
                  {`{"type":"pump_runtime","pump":{"id":0,"active":true,"state":"timed","speed":1,"direction":true,"remaining_ticks":6000,"remaining_seconds":60,"volume_ml":1.2}}`}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <RadioTower className="size-5" />
                MQTT Contract
              </CardTitle>
              <CardDescription>
                Device-centric topics for telemetry, runtime state, and remote commands. The topic base follows the
                configured hostname.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <div>
                <div className="mb-2 font-medium">Published topics</div>
                <div className={codeClassName}>
                  {topicBase}/availability
                  <br />
                  {topicBase}/status
                  <br />
                  {topicBase}/pumps/&lt;id&gt;/state
                </div>
              </div>

              <div>
                <div className="mb-2 font-medium">Subscribed command topics</div>
                <div className={codeClassName}>
                  {topicBase}/command/restart
                  <br />
                  {topicBase}/pumps/&lt;id&gt;/run
                  <br />
                  {topicBase}/pumps/&lt;id&gt;/stop
                  <br />
                  {topicBase}/pumps/&lt;id&gt;/calibration/start
                  <br />
                  {topicBase}/pumps/&lt;id&gt;/calibration/stop
                </div>
              </div>

              <div>
                <div className="mb-2 font-medium">Run command payload</div>
                <div className={codeClassName}>{`{"speed":1,"time":1,"direction":true}`}</div>
              </div>

              <div>
                <div className="mb-2 font-medium">Pump state payload</div>
                <div className={codeClassName}>
                  {`{"id":0,"name":"Pump 1","active":true,"state":"continuous","speed":12,"direction":true,"remaining_ticks":0,"remaining_seconds":0,"volume_ml":15.4,"tank_current_vol":840.5,"tank_full_vol":1000,"running_hours":124.3}`}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <BookText className="size-5" />
                Home Assistant
              </CardTitle>
              <CardDescription>
                Discovery is published automatically under the standard Home Assistant prefix when MQTT connects.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <div className={codeClassName}>
                {`homeassistant/sensor/${topicBase}_free_heap/config`}
                <br />
                {`homeassistant/sensor/${topicBase}_wifi_disconnects/config`}
                <br />
                {`homeassistant/sensor/${topicBase}_pump_0_tank_volume/config`}
                <br />
                {`homeassistant/button/${topicBase}_restart/config`}
              </div>
              <p className="text-muted-foreground">
                Discovery now models the device as a dosing controller rather than a light controller. Pump tank volume,
                running hours, connectivity, and restart actions are exposed as first-class Home Assistant entities.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default ApiDocsPage;
