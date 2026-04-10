import React from 'react';

import type { PumpHistoryPump, PumpState } from '@/lib/api.ts';
import { Button } from '@/components/ui/button';

type PumpSelectorProps = {
  pumps: PumpState[];
  historyPumps: PumpHistoryPump[];
  selectedPumpId: number | null;
  onSelect: (id: number) => void;
};

const PumpSelector = ({ pumps, historyPumps, selectedPumpId, onSelect }: PumpSelectorProps): React.ReactElement => (
  <div className="flex flex-wrap gap-2">
    {(historyPumps.length > 0 ? historyPumps : pumps).map((pump) => (
      <Button
        key={pump.id}
        type="button"
        size="sm"
        variant={pump.id === selectedPumpId ? 'default' : 'outline'}
        className="rounded-full"
        onClick={() => onSelect(pump.id)}
      >
        {pump.name}
      </Button>
    ))}
  </div>
);

export default PumpSelector;
