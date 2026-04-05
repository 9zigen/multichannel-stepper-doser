import React, { useEffect, useMemo, useState } from 'react';

import { Input } from '@/components/ui/input.tsx';
import { Button } from '@/components/ui/button.tsx';

import { PumpCalibrationState, PumpState } from '@/lib/api.ts';
import { AppStoreState, useAppStore } from '@/hooks/use-store.ts';
import { toast } from 'sonner';
import { FlaskConical, Plus, Square } from 'lucide-react';
import { usePumpRuntime } from '@/components/pump-runtime-provider.tsx';
import { Badge } from '@/components/ui/badge.tsx';

export interface PumpFormProps {
  pump: PumpState;
  success?: (cal: PumpCalibrationState) => void;
}

const PumpCalibration = ({ pump }: PumpFormProps): React.ReactElement => {
  const { id, direction, calibration } = pump;
  const updatePumps = useAppStore((state: AppStoreState) => state.updatePump);
  const { runtime, calibrationSessions, beginCalibrationSession, stopCalibrationSession, clearCalibrationSession } =
    usePumpRuntime();

  enum STAGE {
    IDLE,
    START,
    RUNNING,
    STOP,
    FINISHED,
  }

  const [stage, setStage] = useState<STAGE>(STAGE.IDLE);
  const [speed, setSpeed] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0);
  const [flow, setFlow] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [stopTimestamp, setStopTimestamp] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const invalidSpeed: boolean = !!(calibration.find((item) => item.speed === speed) || speed === 0);
  const activeCalibrationRun = useMemo(
    () => runtime.find((entry) => entry.id === id && entry.state === 'calibration') ?? null,
    [id, runtime]
  );
  const calibrationSession = calibrationSessions[id] ?? null;

  const resetCalibrationDraft = React.useCallback(() => {
    setStage(STAGE.IDLE);
    setSpeed(0);
    setVolume(0);
    setFlow(0);
    setStartTimestamp(0);
    setStopTimestamp(0);
    setError(null);
  }, []);

  useEffect(() => {
    if (activeCalibrationRun && calibrationSession) {
      setSpeed(calibrationSession.speed);
      setStartTimestamp(calibrationSession.startedAt);
      setStage(STAGE.RUNNING);
      return;
    }

    if (!activeCalibrationRun && calibrationSession?.stoppedAt) {
      setSpeed(calibrationSession.speed);
      setStartTimestamp(calibrationSession.startedAt);
      setStopTimestamp(calibrationSession.stoppedAt);
      setStage(STAGE.STOP);
      return;
    }

    if (!activeCalibrationRun && !calibrationSession && stage !== STAGE.IDLE && stage !== STAGE.START) {
      resetCalibrationDraft();
    }
  }, [activeCalibrationRun, calibrationSession, id, resetCalibrationDraft, stage]);

  const initCalibration = () => {
    if (stage === STAGE.IDLE || stage === STAGE.FINISHED || stage === STAGE.STOP) {
      setSpeed(0);
      setVolume(0);
      setFlow(0);
      setStartTimestamp(0);
      setStopTimestamp(0);
      setError(null);
      setStage(STAGE.START);
    }
  };

  const updateSpeed = (speed: number) => {
    setSpeed(speed);
    if (calibration.find((item) => item.speed === speed)) {
      setError('Speed is already used.');
      return;
    }
    setError(null);
  };

  const startCalibration = async () => {
    if (speed === 0) {
      setError('Speed is required.');
      return;
    }

    if (calibration.find((item) => item.speed === speed)) {
      setError('Speed is already used.');
      return;
    }

    if (stage === STAGE.START) {
      try {
        const result = await beginCalibrationSession(pump, speed, direction);
        if (result) {
          toast.success('Pump started.');
          setStage(STAGE.RUNNING);
        } else {
          toast.error('Pump start failed.');
          setStage(STAGE.IDLE);
        }
      } catch (e) {
        const error = e as Error;
        toast.error(`Command error: ${error.message}`);
        setStage(STAGE.IDLE);
      }
    }
  };

  const stopCalibration = async () => {
    if (stage === STAGE.RUNNING) {
      try {
        const result = await stopCalibrationSession(id);
        if (result) {
          toast.success('Pump stopped. Waiting for finishing calibration.');
          setStage(STAGE.STOP);
        } else {
          toast.error('Pump stop failed.');
        }
      } catch (e) {
        const error = e as Error;
        toast.error(`Command error: ${error.message}`);
      }
    }
  };

  const discardCalibration = async () => {
    if (activeCalibrationRun) {
      const stopped = await stopCalibrationSession(id);
      if (!stopped) {
        toast.error('Failed to stop active calibration.');
        return;
      }
    }

    clearCalibrationSession(id);
    resetCalibrationDraft();
    toast.success('Calibration draft discarded.');
  };

  const finishCalibration = async () => {
    if (stage === STAGE.STOP) {
      await updatePumps(
        {
          ...pump,
          calibration: [...pump.calibration, { speed, flow }],
        },
        false
      );
      clearCalibrationSession(id);
      setStage(STAGE.FINISHED);
    }
  };

  const calculateFlow = (value: number) => {
    setVolume(value);
    const diff = stopTimestamp - startTimestamp;
    const minutes = diff / 1000 / 60;
    const flow = Math.floor(value / minutes);
    console.log('Flow: ', flow, { diff, minutes });
    setFlow(flow);
  };

  return (
    <React.Fragment>
      <div className="flex flex-row gap-4 mb-4 justify-between items-center">
        <span className="text-base">Calibration</span>
        <div className="flex items-center gap-2">
          {activeCalibrationRun ? (
            <Badge variant="outline" className="gap-2 border-amber-500/30 bg-amber-500/10 text-amber-700">
              <FlaskConical className="size-4" />
              In progress
            </Badge>
          ) : null}
          {activeCalibrationRun ? (
            <Button type="button" size="sm" variant="outline" onClick={stopCalibration}>
              <Square />
            </Button>
          ) : (
            <Button type="button" size="sm" variant="secondary" className="" onClick={initCalibration}>
              <Plus />
            </Button>
          )}
        </div>
      </div>

      {stage > STAGE.IDLE && stage < STAGE.STOP ? (
        <div className="mb-4 rounded-2xl border border-border/70 bg-muted/30 p-4">
          <div className="mb-3 flex flex-col">
            <span className="text-sm text-muted-foreground">Step 1: Prepare 100 ml of test liquid.</span>
            <span className="text-sm text-muted-foreground">Step 2: Set the speed in RPM.</span>
          </div>

          <div className="flex flex-row gap-4 mb-1 justify-between items-center">
            <Input
              type="number"
              name="speed"
              placeholder="RPM"
              value={speed}
              min="0.1"
              step="0.1"
              disabled={stage === STAGE.RUNNING}
              aria-invalid={invalidSpeed}
              onChange={(e) => updateSpeed(Number(e.target.value))}
            ></Input>
            <Button
              type="button"
              variant="secondary"
              className=""
              onClick={stage === STAGE.START ? startCalibration : stopCalibration}
            >
              {stage === STAGE.START ? 'Start' : 'Finish'}
            </Button>
            <Button type="button" variant="outline" className="" onClick={discardCalibration}>
              Discard
            </Button>

            {/*<Input type="number" name="flow" placeholder="ml/min"></Input>*/}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      ) : null}

      {stage == STAGE.STOP ? (
        <div className="mb-4 rounded-2xl border border-border/70 bg-muted/30 p-4">
          <div className="mb-3 flex flex-col">
            <span className="text-sm text-muted-foreground">Step 3: Measure the volume of liquid pumped.</span>
            <span className="text-sm text-muted-foreground">Step 4: Set the volume in ml. Flow will be calculated.</span>
          </div>

          <div className="flex flex-row gap-4 mb-1 justify-between items-end">
            <div className="flex flex-col">
              <div className="pb-1 text-sm text-muted-foreground">
                <label>Volume [ml]</label>
              </div>
              <Input
                type="number"
                name="volume"
                placeholder="ml"
                value={volume}
                min="0.1"
                step="0.1"
                onChange={(e) => calculateFlow(Number(e.target.value))}
              ></Input>
            </div>

            <div className="flex flex-col">
              <div className="pb-1 text-sm text-muted-foreground">
                <label>Flow [ml/min]</label>
              </div>
              <Input
                type="number"
                name="flow"
                placeholder="ml/min"
                value={flow}
                min="0.1"
                step="0.1"
                onChange={(e) => setFlow(Number(e.target.value))}
              ></Input>
            </div>
            <Button type="button" variant="secondary" className="" onClick={finishCalibration}>
              Save calibration
            </Button>
            <Button type="button" variant="outline" className="" onClick={discardCalibration}>
              Discard
            </Button>

            {/*<Input type="number" name="flow" placeholder="ml/min"></Input>*/}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      ) : null}
    </React.Fragment>
  );
};

export default PumpCalibration;
