import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NetworkState, NetworkType } from '@/lib/api.ts';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import {
  defaultsBle,
  defaultsCan,
  defaultsEthernet,
  defaultsThread,
  defaultsWifi,
} from '@/components/network-form/defaults.ts';

const typeOptions = Object.keys(NetworkType)
  .filter((key) => key.length > 1)
  .map((key, idx) => ({
    label: key,
    value: idx,
  }));

const defaults = [defaultsWifi, defaultsEthernet, defaultsBle, defaultsThread, defaultsCan];

export function AddNetworkCombobox(): React.ReactElement {
  const networks = useAppStore((state: AppStoreState) => state.settings.networks);
  const addNetwork = useAppStore((state: AppStoreState) => state.addNetwork);
  const [open, setOpen] = React.useState(false);

  const onSelect = (selected: string) => {
    const defaultValue = defaults.find((x) => x.type === Number(selected));
    if (defaultValue) {
      addNetwork(defaultValue as NetworkState);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-[200px] justify-between">
          <Plus /> Add new connection
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search network..." className="h-9" />
          <CommandList>
            <CommandEmpty>Interface not found.</CommandEmpty>
            <CommandGroup>
              {typeOptions.map((item) => {
                const addedTypes = networks.map((x) => x.type);

                return (
                  <CommandItem
                    key={item.value}
                    disabled={networks.find((x) => x.type === item.value) !== undefined}
                    value={String(item.value)}
                    onSelect={onSelect}
                  >
                    {item.label}
                    <Check className={cn('ml-auto', addedTypes.includes(item.value) ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
