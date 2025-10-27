import React, { useEffect, useState } from 'react';

import { PumpState } from '@/lib/api.ts';
import { useAppStore } from '@/hooks/use-store.ts';
import PumpForm from '@/components/pump-form.tsx';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer.tsx';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Cog, RotateCcw, RotateCw } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile.ts';
import { Card, CardContent } from '@/components/ui/card.tsx';
import { Button } from '@/components/ui/button.tsx';

const PumpsPage: React.FC = (): React.ReactElement => {
  const isMobile = useIsMobile();
  const appStore = useAppStore();
  const { settings } = appStore;
  const { pumps } = settings;
  const [selectedPump, setSelectedPump] = useState<PumpState | null>(null);

  useEffect(() => {
    if (selectedPump !== null) {
      const pump = pumps.find((x) => x.id === selectedPump.id);
      if (pump != undefined) {
        setSelectedPump(pump);
      }
    }
  }, [settings]);

  const renderRotation = (state: PumpState) => {
    return state.direction ? <RotateCw size={16} /> : <RotateCcw size={16} />;
  };

  return (
    <div className="flex flex-col items-center justify-center gap-6">
      <section className="flex flex-row justify-center gap-6 w-full">
        {pumps?.map((pump) => {
          const percentage = (pump.tank_current_vol / pump.tank_full_vol) * 100;
          return (
            <Card key={pump.id} className="w-full shadow-none animate-in fade-in zoom-in">
              <CardContent className="text-sm">
                <div className="flex flex-row items-center justify-between pb-4">
                  <span className="text-xl">{pump.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => setSelectedPump({ ...pump })}
                  >
                    <Cog />
                  </Button>
                </div>

                <div className="flex items-center gap-2">Rotation: {renderRotation(pump)}</div>
                <div className="flex items-center gap-2">Tank Volume: {percentage.toFixed(2)} %</div>
              </CardContent>
            </Card>
          );
        })}

        {isMobile ? (
          <Drawer open={selectedPump !== null} onClose={() => setSelectedPump(null)}>
            <DrawerContent className="px-4 pb-4 bg-card h-[calc(100vh-10px)]">
              <div className="flex flex-col w-full sm:w-[400px] items-center mx-auto">
                <DrawerHeader className="text-center">
                  <DrawerTitle>Edit: {selectedPump?.name}</DrawerTitle>
                  <DrawerDescription>This action cannot be undone.</DrawerDescription>
                </DrawerHeader>
                <div className="flex flex-col">
                  {selectedPump === null ? null : (
                    <PumpForm pump={selectedPump} success={() => setSelectedPump(null)} />
                  )}
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <Dialog open={selectedPump !== null} onOpenChange={() => setSelectedPump(null)}>
            <DialogContent className="sm:max-w-[425px] lg:max-w-[500px] xl:max-w-[800px] bg-card">
              <DialogHeader>
                <DialogTitle>Edit: {selectedPump?.name}</DialogTitle>
                <DialogDescription>This action cannot be undone.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col">
                {selectedPump === null ? null : <PumpForm pump={selectedPump} success={() => setSelectedPump(null)} />}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </section>
    </div>
  );
};

export default PumpsPage;
