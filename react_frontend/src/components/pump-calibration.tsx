import React, { useState } from "react";

import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";

import { PumpCalibrationState, PumpRunResponse, PumpState, runPump } from "@/lib/api.ts";
import { AppStoreState, useAppStore } from "@/hooks/use-store.ts";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export interface PumpFormProps {
    pump: PumpState
    success?: (cal: PumpCalibrationState) => void
}

const PumpCalibration = ({pump}: PumpFormProps): React.ReactElement => {
    const { id, direction, calibration } = pump;
    const updatePumps = useAppStore((state: AppStoreState) => state.updatePumps);

    enum STAGE {
        IDLE,
        START,
        RUNNING,
        STOP,
        FINISHED,
    }

    const [stage, setStage] = useState<STAGE>(STAGE.IDLE)
    const [speed, setSpeed] = useState<number>(0)
    const [volume, setVolume] = useState<number>(0)
    const [flow, setFlow] = useState<number>(0)
    const [startTimestamp, setStartTimestamp] = useState<number>(0)
    const [stopTimestamp, setStopTimestamp] = useState<number>(0)
    const [error, setError] = useState<string | null>(null)
    const invalidSpeed: boolean = !!(calibration.find((item) => item.speed === speed) || speed === 0)

    const initCalibration = () => {
        if (stage === STAGE.IDLE || stage === STAGE.FINISHED) {
            setStage(STAGE.START)
        }
    }

    const updateSpeed = (speed: number) => {
        setSpeed(speed)
        if (calibration.find((item) => item.speed === speed)) {
            setError("Speed is already used.")
            return
        }
        setError(null)
    }

    const startCalibration = async () => {
        if (speed === 0) {
            setError("Speed is required.")
            return
        }

        if (calibration.find((item) => item.speed === speed)) {
            setError("Speed is already used.")
            return
        }

        if (stage === STAGE.START) {
            try {
                console.log("Pump start calibration: ", speed, "RPM, ")
                const result = await runPump({ speed: speed, id: id, direction: direction, time: -1 }) as PumpRunResponse
                if (result.success) {
                    toast.success("Pump started.")
                    setStartTimestamp(Date.now())
                    setStage(STAGE.RUNNING)
                } else {
                    toast.error("Pump start failed.")
                    setStage(STAGE.IDLE)
                }
            } catch (e) {
                const error = e as Error;
                toast.error(`Command error: ${error.message}`)
                setStage(STAGE.IDLE)
            }
        }
    }

    const stopCalibration = async () => {
        if (stage === STAGE.RUNNING) {
            try {
                console.log("Pump stop calibration: ", speed, "RPM, ")
                const result = await runPump({ speed: speed, id: id, direction: direction, time: 0 }) as PumpRunResponse
                if (result.success) {
                    toast.success("Pump stopped. Waiting for finishing calibration.")
                    setStopTimestamp(Date.now())
                    setStage(STAGE.STOP)
                } else {
                    toast.error("Pump stop failed.")
                }
            } catch (e) {
                const error = e as Error;
                toast.error(`Command error: ${error.message}`)
            }
        }
    }

    const finishCalibration = async () => {
        if (stage === STAGE.STOP) {
            console.log("Pump finished calibration: ", speed, "RPM, ", volume, "ml, ", flow, "ml/min, ")
            setStage(STAGE.FINISHED)
            await updatePumps({
                ...pump,
                calibration: [...pump.calibration, {speed, flow}]
            })
        }
    }

    const calculateFlow = (value: number) => {
        setVolume(value)
        const diff = stopTimestamp - startTimestamp
        const minutes = diff / 1000 / 60
        const flow = Math.floor(value / minutes)
        console.log("Flow: ", flow, {diff, minutes})
        setFlow(flow)
    }

    return (
        <React.Fragment>
            <div className="flex flex-row gap-4 mb-4 justify-between items-center">
                <span className="text-base">Calibration</span>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className=""
                    onClick={initCalibration}
                >
                    <Plus />
                </Button>
            </div>

            {
                stage > STAGE.IDLE && stage < STAGE.STOP? (
                    <div className="flex flex-col mb-4">
                        <span className="text-sm text-gray-500">Step 1: Prepare 100 ml of test liquid.</span>
                        <span className="text-sm text-gray-500 pb-2">Step 2: Set the speed in RPM.</span>

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
                                onChange={(e) => updateSpeed(Number(e.target.value))}></Input>
                            <Button
                                type="button"
                                variant="secondary"
                                className=""
                                onClick={stage === STAGE.START? startCalibration : stopCalibration}
                            >
                                {stage === STAGE.START? 'start' : 'stop'}
                            </Button>

                            {/*<Input type="number" name="flow" placeholder="ml/min"></Input>*/}
                        </div>
                        {error && <p role="alert" className="text-red-800 text-sm">{error}</p>}
                    </div>
                ) : null
            }

            {
                stage == STAGE.STOP? (
                    <div className="flex flex-col mb-4">
                        <span className="text-sm text-gray-500">Step 3: Measure the volume of liquid pumped.</span>
                        <span className="text-sm text-gray-500 pb-2">Step 4: Set the volume in ml. Flow will be calculated.</span>

                        <div className="flex flex-row gap-4 mb-1 justify-between items-end">
                            <div className="flex flex-col">
                                <div className="text-gray-500 text-sm pb-1">
                                    <label>Volume [ml]</label>
                                </div>
                                <Input
                                    type="number"
                                    name="volume"
                                    placeholder="ml"
                                    value={volume}
                                    min="0.1"
                                    step="0.1"
                                    onChange={(e) => calculateFlow(Number(e.target.value))}></Input>
                            </div>

                            <div className="flex flex-col">
                                <div className="text-gray-500 text-sm pb-1">
                                    <label>Flow [ml/min]</label>
                                </div>
                                <Input
                                    type="number"
                                    name="flow"
                                    placeholder="ml/min"
                                    value={flow}
                                    min="0.1"
                                    step="0.1"
                                    onChange={(e) => setFlow(Number(e.target.value))}></Input>
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                className=""
                                onClick={finishCalibration}
                            >
                                Finish
                            </Button>

                            {/*<Input type="number" name="flow" placeholder="ml/min"></Input>*/}
                        </div>
                        {error && <p role="alert" className="text-red-800 text-sm">{error}</p>}
                    </div>
                ) : null
            }
        </React.Fragment>
    );
};

export default PumpCalibration;