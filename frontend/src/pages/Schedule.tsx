import React from 'react';

import { useAppStore } from '@/hooks/use-store.ts';
import ScheduleForm from '@/components/schedule-form.tsx';
import { Cylinder } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const Schedule: React.FC = (): React.ReactElement => {
  const appStore = useAppStore();
  const { settings } = appStore;
  const { pumps } = settings;

  return (
    <div className="flex flex-col items-center justify-center gap-6">
      <section className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-6 w-full">
        {pumps?.map((pump) => {
          const percentage = (pump.tank_current_vol / pump.tank_full_vol) * 100;
          return (
            <Card
              key={pump.id}
              className="w-full sm:w-[calc(50%-(--spacing(6)))] xl:w-[calc(30%-(--spacing(24)))] shadow-none animate-in fade-in zoom-in"
            >
              <CardHeader>
                <CardTitle>{pump.name}</CardTitle>
                <CardDescription>
                  <div className="flex flex-row items-center gap-1">
                    <Cylinder size={16} />
                    {percentage}%
                  </div>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScheduleForm pump={pump} />
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
};

export default Schedule;
