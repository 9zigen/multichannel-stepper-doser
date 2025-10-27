import React, {useEffect, useState} from 'react';

import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import NetworkForm from '@/components/network-form.tsx';
import {Trash2, Edit, Plus} from 'lucide-react';
import { NetworkState, NetworkType } from '@/lib/api.ts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import {Alert} from "@/components/ui/alert.tsx";
import { AddNetworkCombobox } from "@/components/network-form/add-network-combobox.tsx"

const NetworkPage: React.FC = (): React.ReactElement => {
  const networks = useAppStore((state: AppStoreState) => state.settings.networks);
  const addNetwork = useAppStore((state: AppStoreState) => state.addNetwork);
  const deleteNetwork = useAppStore((state: AppStoreState) => state.deleteNetwork);

  const [selectedNetwork, setSelectedNetwork] = useState<NetworkState | null>(null);
  const [newConnectionType, setNewConnectionType] = useState<NetworkType>(0);
  
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
            <CardTitle>Network</CardTitle>
            <CardDescription>Connection settings</CardDescription>
          </CardHeader>
          <CardContent>
            {networks.length ? (
              networks.map((x, index) => {
                return (
                  <div key={index} className="w-full flex flex-col gap-6">
                    <div className="flex flex-row gap-4 justify-between items-center w-full h-[30px]">
                      <span>{NetworkType[x.type]} connection</span>
                      <div className="flex flex-row">
                        <Button variant="link" onClick={() => setSelectedNetwork(x)}>
                          <Edit className="text-muted-foreground" />
                        </Button>
                        <Separator orientation="vertical"/>
                        <Button variant="link" onClick={() => deleteNetwork(x.id)}>
                          <Trash2 className="stroke-red-400" />
                        </Button>
                      </div>
                      {/*<DropdownMenu>*/}
                      {/*  <DropdownMenuTrigger asChild>*/}
                      {/*    <span className="flex items-center w-5 cursor-pointer">*/}
                      {/*      <MoreHorizontal />*/}
                      {/*    </span>*/}
                      {/*  </DropdownMenuTrigger>*/}
                      {/*  <DropdownMenuContent className="w-32 rounded-lg">*/}
                      {/*    <DropdownMenuItem onClick={() => setSelectedNetwork({ ...x })}>*/}
                      {/*      <Edit className="text-muted-foreground" />*/}
                      {/*      <span>Edit</span>*/}
                      {/*    </DropdownMenuItem>*/}
                      {/*    <DropdownMenuSeparator />*/}
                      {/*    <DropdownMenuItem*/}
                      {/*      onClick={() => {*/}
                      {/*        console.log('delete');*/}
                      {/*      }}*/}
                      {/*    >*/}
                      {/*      <Trash2 className="text-muted-foreground" />*/}
                      {/*      <span>Delete</span>*/}
                      {/*    </DropdownMenuItem>*/}
                      {/*  </DropdownMenuContent>*/}
                      {/*</DropdownMenu>*/}
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
            
            <div className="flex w-full justify-end mt-4">
              <Button variant="link"><Plus/>Add new connection</Button>
              <AddNetworkCombobox/>
            </div>

            {/*{!addingConnection ? (*/}
            {/*  <Button onClick={() => setAddingConnection(!addingConnection)} className="w-full">*/}
            {/*    Add connection*/}
            {/*  </Button>*/}
            {/*) : (*/}
            {/*  <React.Fragment>*/}
            {/*    <Select onValueChange={(e) => setNewConnectionType(Number(e))}>*/}
            {/*      <SelectTrigger className="w-full">*/}
            {/*        <SelectValue placeholder="Connection Type" />*/}
            {/*      </SelectTrigger>*/}
            {/*      <SelectContent>*/}
            {/*        {supportedTypes*/}
            {/*          .map((item) => (*/}
            {/*            <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>*/}
            {/*          ))}*/}
            {/*      </SelectContent>*/}
            {/*    </Select>*/}
            {/*  </React.Fragment>*/}
            {/*)}*/}
          </CardContent>
        </Card>

        <Card className="w-full shadow-none animate-in fade-in zoom-in">
          <CardHeader>
            <CardTitle>
              {
                selectedNetwork === null? <span>New Connection</span> : <span>Edit {NetworkType[selectedNetwork.type]} connection</span>
              }
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NetworkForm isNew={networks.length === 0} id={selectedNetwork?.id} type={newConnectionType} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default NetworkPage;
