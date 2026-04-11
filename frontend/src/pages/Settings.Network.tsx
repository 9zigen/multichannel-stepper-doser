import React, { useEffect, useMemo, useState } from 'react';
import { Edit, Network, PlusCircle, Router, Trash2, Wifi } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import NetworkForm from '@/components/network-form.tsx';
import { NetworkState, NetworkType } from '@/lib/api.ts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { AddNetworkCombobox } from '@/components/network-form/add-network-combobox.tsx';
import { cn } from '@/lib/utils';

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
        ? `${network.ssid}${network.keep_ap_active ? ' · AP+STA' : ' · STA only'}`
        : 'SSID not configured';
    case NetworkType.Ethernet:
      return network.dhcp ? 'DHCP' : network.ip_address || 'Static IP not set';
    default:
      return 'Not configured';
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

  const wifiConnection = useMemo(
    () => networks.find((network) => network.type === NetworkType.WiFi) ?? null,
    [networks],
  );

  return (
    <div className="flex flex-col gap-4 py-2 md:py-3">
      <section className="mx-auto w-full max-w-screen-2xl px-3">
        <div className="flex flex-col gap-4">
          {guidedMode ? (
            <Alert className="p-4">
              <Network />
              <AlertTitle>Guided onboarding step</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>Configure at least one network, then return to onboarding to finish.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
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

          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Network className="size-4 text-muted-foreground" />
                  <CardTitle className="text-lg">Connections</CardTitle>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1.5 tabular-nums">
                    {networks.length} {networks.length === 1 ? 'link' : 'links'}
                  </Badge>
                  {wifiConnection && (
                    <Badge variant="secondary">
                      {wifiConnection.keep_ap_active ? 'AP+STA' : 'STA only'}
                    </Badge>
                  )}
                  <AddNetworkCombobox />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {networks.length ? (
                <>
                  {/* Connection rows */}
                  <div className="flex flex-col gap-2">
                    {networks.map((network, index) => {
                      const Icon = getNetworkIcon(network.type);
                      const isSelected = selectedNetwork?.id === network.id;

                      return (
                        <div
                          key={network.id}
                          className={cn(
                            'animate-fade-in-up rounded-lg border border-border/40 bg-secondary/10 transition-colors',
                            isSelected && 'border-primary/30 bg-primary/5 shadow-[0_0_12px_rgba(34,211,238,0.1)]',
                          )}
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          {/* Row header */}
                          <div className="flex items-center justify-between gap-3 p-3">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                              onClick={() => setSelectedNetwork(isSelected ? null : network)}
                            >
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary/50">
                                <Icon className="size-4 text-muted-foreground" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{NetworkType[network.type]}</span>
                                  <Badge variant={network.type === NetworkType.WiFi ? 'default' : 'secondary'} className="text-xs">
                                    {network.type === NetworkType.WiFi ? 'Wireless' : network.type === NetworkType.Ethernet ? 'Wired' : NetworkType[network.type]}
                                  </Badge>
                                </div>
                                <span className="text-xs text-muted-foreground">{getNetworkSummary(network)}</span>
                              </div>
                            </button>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant={isSelected ? 'secondary' : 'ghost'}
                                size="icon"
                                className="size-7"
                                onClick={() => setSelectedNetwork(isSelected ? null : network)}
                              >
                                <Edit className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => deleteNetwork(network.id)}
                              >
                                <Trash2 className="size-3.5 text-destructive" />
                              </Button>
                            </div>
                          </div>

                          {/* Expanded form */}
                          {isSelected && (
                            <div className="border-t border-border/40 p-3 pt-4">
                              <NetworkForm network={networks.find((n) => n.id === selectedNetwork.id)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 bg-secondary/10 p-6 text-center">
                  <div className="flex size-10 items-center justify-center rounded-md bg-secondary/50">
                    <PlusCircle className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">No connections yet</span>
                    <span className="text-xs text-muted-foreground">
                      Add a Wi-Fi or Ethernet profile to bring the device online.
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default NetworkPage;
