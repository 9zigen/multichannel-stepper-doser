import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Input } from '@/components/ui/input';
import { BookText, Cable, RadioTower, Search, Webhook } from 'lucide-react';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';

const Code = ({ children }: { children: React.ReactNode }) => (
  <pre className="overflow-x-auto rounded-md border border-border/30 bg-secondary/10 px-3 py-2 font-mono text-xs leading-5 text-foreground">
    {children}
  </pre>
);

const ApiDocsPage: React.FC = (): React.ReactElement => {
  const services = useAppStore((state: AppStoreState) => state.settings.services);
  const topicBase = services.hostname || 'stepper-doser';
  const [filter, setFilter] = useState('');

  const sections = useMemo(
    () => [
      {
        id: 'rest',
        title: 'REST API',
        icon: Webhook,
        badge: 'HTTP JSON',
        keywords: 'rest api http json endpoints status settings run calibration pumps runtime upload restart factory reset post get bearer token authorization',
        content: (
          <>
            <div className="mb-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Endpoints</div>
              <Code>
                {'GET  /api/status\nGET  /api/settings\nPOST /api/settings\nPOST /api/run\nPOST /api/calibration\nGET  /api/pumps/runtime\nPOST /api/device/restart\nPOST /api/device/factory-reset\nPOST /upload'}
              </Code>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Manual pump run</div>
              <Code>
                {'POST /api/run\nAuthorization: Bearer <token>\n{"id":0,"direction":true,"speed":1,"time":1}'}
              </Code>
            </div>
          </>
        ),
      },
      {
        id: 'websocket',
        title: 'WebSocket',
        icon: Cable,
        badge: 'Realtime',
        keywords: 'websocket ws realtime ping pong pump runtime push event connection heartbeat live',
        content: (
          <>
            <div className="mb-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Connection</div>
              <Code>{'ws://<device-ip>/ws?token=<bearer-token>'}</Code>
            </div>
            <div className="mb-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Heartbeat</div>
              <Code>{'{"type":"ping"}'}</Code>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Pump runtime event</div>
              <Code>
                {'{"type":"pump_runtime","pump":{"id":0,\n "active":true,"state":"timed","speed":1,\n "direction":true,"remaining_seconds":60,\n "volume_ml":1.2}}'}
              </Code>
            </div>
          </>
        ),
      },
      {
        id: 'mqtt',
        title: 'MQTT',
        icon: RadioTower,
        badge: 'Pub/Sub',
        keywords: `mqtt topic publish subscribe command availability status pumps run stop calibration start broker telemetry ${topicBase}`,
        content: (
          <>
            <div className="mb-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Published topics</div>
              <Code>
                {`${topicBase}/availability\n${topicBase}/status\n${topicBase}/pumps/<id>/state`}
              </Code>
            </div>
            <div className="mb-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Command topics</div>
              <Code>
                {`${topicBase}/command/restart\n${topicBase}/pumps/<id>/run\n${topicBase}/pumps/<id>/stop\n${topicBase}/pumps/<id>/calibration/start\n${topicBase}/pumps/<id>/calibration/stop`}
              </Code>
            </div>
            <div className="mb-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Run payload</div>
              <Code>{'{"speed":1,"time":1,"direction":true}'}</Code>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">State payload</div>
              <Code>
                {'{"id":0,"name":"Pump 1","active":true,\n "state":"continuous","speed":12,\n "direction":true,"volume_ml":15.4,\n "tank_current_vol":840.5,\n "tank_full_vol":1000,\n "running_hours":124.3}'}
              </Code>
            </div>
          </>
        ),
      },
      {
        id: 'homeassistant',
        title: 'Home Assistant',
        icon: BookText,
        badge: 'Discovery',
        keywords: `homeassistant ha discovery sensor button config integration free heap wifi disconnects pump tank volume restart ${topicBase}`,
        content: (
          <>
            <div className="mb-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Discovery topics</div>
              <Code>
                {`homeassistant/sensor/${topicBase}_free_heap/config\nhomeassistant/sensor/${topicBase}_wifi_disconnects/config\nhomeassistant/sensor/${topicBase}_pump_0_tank_volume/config\nhomeassistant/button/${topicBase}_restart/config`}
              </Code>
            </div>
            <p className="text-xs text-muted-foreground">
              Discovery models the device as a dosing controller. Pump tank volume, running hours, connectivity, and
              restart actions are exposed as Home Assistant entities.
            </p>
          </>
        ),
      },
    ],
    [topicBase],
  );

  const filtered = filter
    ? sections.filter(
        (s) =>
          s.title.toLowerCase().includes(filter.toLowerCase()) ||
          s.keywords.toLowerCase().includes(filter.toLowerCase()),
      )
    : sections;

  return (
    <div className="flex flex-col gap-4 py-2 md:py-3">
      <section className="mx-auto w-full max-w-screen-2xl px-3">
        <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Webhook className="size-4 text-muted-foreground" />
                <CardTitle className="text-lg">API Reference</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{topicBase}</Badge>
                <Badge variant="outline">REST</Badge>
                <Badge variant="outline">WS</Badge>
                <Badge variant="outline">MQTT</Badge>
              </div>
            </div>
            {/* Search */}
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Filter docs... (e.g. mqtt, run, calibration)"
                className="h-8 pl-8 text-sm"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              REST and WebSocket use bearer token auth. MQTT uses broker credentials from device settings.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {filtered.length > 0 ? (
              filtered.map((section, index) => {
                const Icon = section.icon;
                return (
                  <div
                    key={section.id}
                    className="animate-fade-in-up rounded-lg border border-border/40 bg-secondary/10 p-3"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Icon className="size-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{section.title}</span>
                      <Badge variant="outline" className="text-xs">{section.badge}</Badge>
                    </div>
                    {section.content}
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed border-border/60 bg-secondary/10 px-4 py-6 text-center text-sm text-muted-foreground">
                No matching sections for &ldquo;{filter}&rdquo;
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default ApiDocsPage;
