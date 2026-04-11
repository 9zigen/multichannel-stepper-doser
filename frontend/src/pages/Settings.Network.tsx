import React, { useEffect, useMemo, useState } from 'react';
import { Edit, Globe, Network, PlusCircle, Router, ShieldCheck, Trash2, Wifi } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import NetworkForm from '@/components/network-form.tsx';
import { NetworkState, NetworkType } from '@/lib/api.ts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { AddNetworkCombobox } from '@/components/network-form/add-network-combobox.tsx';

const getNetworkIcon = (type: NetworkType) => {
  switch (type) {
    case NetworkType.WiFi:
      return Wifi;
    case NetworkType.Ethernet:
      return Router;
    default:
      return Network;
  }
};

const getNetworkSummary = (network: NetworkState): string => {
  switch (network.type) {
    case NetworkType.WiFi:
      return network.ssid
        ? `${network.ssid}${network.keep_ap_active ? ' • AP+STA enabled' : ' • STA only'}`
        : 'SSID not configured';
    case NetworkType.Ethernet:
      return network.dhcp ? 'DHCP enabled' : network.ip_address || 'Static IP not configured';
    default:
      return 'Additional interface';
  }
};

const NetworkPage: React.FC = (): React.ReactElement => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const networks = useAppStore((state: AppStoreState) => state.settings.networks);
  const deleteNetwork = useAppStore((state: AppStoreState) => state.deleteNetwork);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkState | null>(null);
  const guidedMode = searchParams.get('guided') === '1';

  useEffect(() => {
    if (networks.length === 1) {
      setSelectedNetwork(networks[0]);
      return;
    }

    if (networks.length === 0) {
      setSelectedNetwork(null);
      return;
    }

    if (selectedNetwork) {
      const updatedSelection = networks.find((network) => network.id === selectedNetwork.id) ?? null;
      setSelectedNetwork(updatedSelection);
    }
  }, [networks]);

  const primaryConnection = useMemo(
    () =>
      networks.find((network) => network.type === NetworkType.WiFi) ??
      networks.find((network) => network.type === NetworkType.Ethernet) ??
      networks[0] ??
      null,
    [networks]
  );
  const wifiConnection = useMemo(
    () => networks.find((network) => network.type === NetworkType.WiFi) ?? null,
    [networks]
  );

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-4 md:py-6">
      <section className="container grid gap-8 px-4 md:px-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="shadow-none animate-in fade-in zoom-in">
          <CardHeader>
            <CardTitle className="text-xl">Network Overview</CardTitle>
            <CardDescription>
              Review active interfaces, choose which link to edit, and keep addressing predictable for local device
              access.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <Globe className="size-4 text-muted-foreground" />
                  Configured links
                </div>
                <Badge variant="secondary">{networks.length}</Badge>
              </div>

              <div className="grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Primary access</span>
                  <Badge variant={primaryConnection ? 'default' : 'outline'}>
                    {primaryConnection ? NetworkType[primaryConnection.type] : 'None'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Address mode</span>
                  <Badge
                    variant={
                      primaryConnection && 'dhcp' in primaryConnection && !primaryConnection.dhcp
                        ? 'secondary'
                        : 'outline'
                    }
                  >
                    {primaryConnection && 'dhcp' in primaryConnection
                      ? primaryConnection.dhcp
                        ? 'DHCP'
                        : 'Static'
                      : 'N/A'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Device reachability</span>
                  <Badge variant={networks.length ? 'secondary' : 'outline'}>
                    {networks.length ? 'Configured' : 'Missing'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Provisioning mode</span>
                  <Badge variant={wifiConnection?.keep_ap_active ? 'default' : 'outline'}>
                    {wifiConnection ? (wifiConnection.keep_ap_active ? 'AP+STA' : 'STA only') : 'No Wi-Fi'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 text-sm">
              <div className="mb-2 font-medium">Current summary</div>
              <div className="grid gap-3 text-muted-foreground">
                {networks.length ? (
                  networks.map((network, index) => (
                    <div key={network.id} className="animate-fade-in-up" style={{ animationDelay: `${index * 50}ms` }}>
                      <div className="text-xs uppercase tracking-wide">{NetworkType[network.type]}</div>
                      <div>{getNetworkSummary(network)}</div>
                    </div>
                  ))
                ) : (
                  <div>No interfaces configured yet.</div>
                )}
              </div>
            </div>

            <Alert className="p-4">
              <ShieldCheck />
              <AlertTitle>Useful IoT defaults</AlertTitle>
              <AlertDescription>
                Use scan-first Wi-Fi setup during first boot, keep simultaneous AP + Station enabled until the device is
                proven stable on your router, and switch to static addressing only when you need a fixed endpoint.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {guidedMode ? (
            <Alert className="p-4">
              <Network />
              <AlertTitle>Guided onboarding step</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>Configure at least one network, then return to onboarding to finish the first-run checklist.</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSearchParams({});
                    navigate('/onboarding');
                  }}
                >
                  Return to onboarding
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <Card className="shadow-none animate-in fade-in zoom-in">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-xl">Connections</CardTitle>
                  <CardDescription>
                    Each interface is split by transport so Wi-Fi and Ethernet can be managed independently.
                  </CardDescription>
                </div>
                <AddNetworkCombobox />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {networks.length ? (
                networks.map((network, index) => {
                  const Icon = getNetworkIcon(network.type);
                  const isSelected = selectedNetwork?.id === network.id;

                  return (
                    <div key={network.id} className="animate-fade-in-up rounded-xl border bg-card p-4" style={{ animationDelay: `${index * 50}ms` }}>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                            <Icon className="size-4 text-muted-foreground" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{NetworkType[network.type]}</span>
                              <Badge variant={network.type === NetworkType.WiFi ? 'default' : 'secondary'}>
                                {network.type === NetworkType.WiFi ? 'Wireless' : 'Wired'}
                              </Badge>
                            </div>
                            <span className="text-sm text-muted-foreground">{getNetworkSummary(network)}</span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant={isSelected ? 'secondary' : 'outline'}
                            onClick={() => setSelectedNetwork(network)}
                          >
                            <Edit data-icon="inline-start" />
                            {isSelected ? 'Editing' : 'Edit'}
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => deleteNetwork(network.id)}>
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <Alert>
                  <PlusCircle />
                  <AlertTitle>No connections yet</AlertTitle>
                  <AlertDescription>
                    Add a Wi-Fi or Ethernet profile to bring the device onto your local network.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {networks.length > 0 ? (
            <Card className="shadow-none animate-in fade-in zoom-in">
              <CardHeader>
                <CardTitle className="text-xl">
                  {selectedNetwork ? `Edit ${NetworkType[selectedNetwork.type]} connection` : 'Select a connection'}
                </CardTitle>
                <CardDescription>
                  {selectedNetwork
                    ? 'Adjust addressing and transport settings for the selected interface.'
                    : 'Choose a connection above to inspect or update its settings.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedNetwork ? (
                  <NetworkForm network={networks.find((network) => network.id === selectedNetwork.id)} />
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    Select a connection from the list above to start editing.
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default NetworkPage;
