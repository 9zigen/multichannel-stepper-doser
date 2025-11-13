import React, { useEffect, useState } from 'react';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import NetworkForm from '@/components/network-form.tsx';
import { Trash2, Edit } from 'lucide-react';
import { NetworkState, NetworkType } from '@/lib/api.ts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { Alert } from '@/components/ui/alert.tsx';
import { AddNetworkCombobox } from '@/components/network-form/add-network-combobox.tsx';
import { cn } from '@/lib/utils';

const NetworkPage: React.FC = (): React.ReactElement => {
  const networks = useAppStore((state: AppStoreState) => state.settings.networks);
  const deleteNetwork = useAppStore((state: AppStoreState) => state.deleteNetwork);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkState | null>(null);

  useEffect(() => {
    if (networks.length === 1) {
      setSelectedNetwork(networks[0]);
    }

    if (networks.length === 0) {
      setSelectedNetwork(null);
    }
  }, [networks]);

  return (
    <div className="flex flex-col items-center justify-center">
      <section className="flex flex-col items-center justify-center gap-6 w-full sm:w-[400px] xl:w-[600px]">
        <Card className="w-full shadow-none animate-in fade-in zoom-in">
          <CardHeader>
            <CardTitle className="text-xl">Network</CardTitle>
            <CardDescription>Device interface settings</CardDescription>
          </CardHeader>
          <CardContent className="w-full flex flex-col gap-4">
            {networks.length ? (
              networks.map((x, index) => {
                const selected = selectedNetwork?.type === x.type;
                return (
                  <div key={index} className="flex flex-row justify-between items-center w-full">
                    <div className="flex flex-row gap-2 w-full">
                      <Button
                        className={cn('w-full justify-between text-gray-700', selected ? 'bg-accent' : null)}
                        variant="outline"
                        onClick={() => setSelectedNetwork(x)}
                      >
                        <span>{NetworkType[x.type]} connection</span>
                        <Edit />
                      </Button>

                      <Button size="icon" variant="outline" onClick={() => deleteNetwork(x.id)}>
                        <Trash2 className="stroke-red-400" />
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <React.Fragment>
                <Alert className="mb-2 text-sm bg-orange-50 flex text-yellow-600">
                  No connections have been created yet
                </Alert>
              </React.Fragment>
            )}

            <Separator className="my-4" />
            <div className="flex w-full justify-end">
              <AddNetworkCombobox />
            </div>
          </CardContent>
        </Card>

        {networks.length > 0 ? (
          <Card className="w-full shadow-none animate-in fade-in zoom-in">
            <CardHeader>
              <CardTitle>
                {selectedNetwork === null ? (
                  <span>New Connection</span>
                ) : (
                  <span>Edit {NetworkType[selectedNetwork.type]} connection</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NetworkForm network={networks.find((x) => x.id === selectedNetwork?.id)} />
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  );
};

export default NetworkPage;
