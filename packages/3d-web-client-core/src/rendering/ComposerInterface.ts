import { Scene, WebGLRenderer, PerspectiveCamera, Texture } from "three";
import { CameraManager } from "../camera/CameraManager";
import { Sun } from "../sun/Sun";
import { TimeManager } from "../time/TimeManager";

export type EnvironmentConfiguration = {
    hdriUrl?: string;
    hdriIsJpg?: boolean;
    hdriIntensity?: number;
    ambientLightIntensity?: number;
    // etc..
}

export interface IComposer {
    readonly scene: Scene;
    readonly renderer: WebGLRenderer;
    readonly cameraManager: CameraManager;
    readonly postPostScene: Scene;
    readonly sun: Sun | null;
    readonly spawnSun: boolean;

    fitContainer(): void;
    render(timeManager: TimeManager): void;
    dispose(): void;
    updateEnvironmentConfiguration(environmentConfiguration: EnvironmentConfiguration): void;
    setupTweakPane(tweakPane: any): void;
    setHDRIFromFile(): void;
    setFog(): void;
    setAmbientLight(): void;
    updateSkyShaderValues(): void;
    updateSunValues(): void;
    updateSun(): void;
    togglePostProcessing(enabled: boolean): void;
    useHDRJPG(url: string): void;
    useHDRI(url: string): void;
}
