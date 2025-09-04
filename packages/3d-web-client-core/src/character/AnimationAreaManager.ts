import { AnimationArea, OrientedBoundingBox } from "@mml-io/mml-web";
import { ThreeJSGraphicsAdapter } from "@mml-io/mml-web-threejs";
import { AnimationClip } from "three";

import { Vect3 } from "../math/Vect3";

import { Character } from "./Character";
import { AnimationState } from "./CharacterState";
import { CharacterModelLoader } from "./loading/CharacterModelLoader";

type Area = {
  animationArea: AnimationArea<ThreeJSGraphicsAdapter>;
  allocatedState: AnimationState;
  clipLoaded: boolean;
  clip?: AnimationClip;
};

/** Lightweight manager to create / update / remove animation areas; integrates with CharacterManager */
export class AnimationAreaManager {
  private areas = new Map<string, Area>();

  private availableCustomStates: AnimationState[] = [
    AnimationState.custom0,
    AnimationState.custom1,
    AnimationState.custom2,
    AnimationState.custom3,
    AnimationState.custom4,
    AnimationState.custom5,
    AnimationState.custom6,
    AnimationState.custom7,
    AnimationState.custom8,
    AnimationState.custom9,
    AnimationState.custom10,
    AnimationState.custom11,
    AnimationState.custom12,
    AnimationState.custom13,
    AnimationState.custom14,
    AnimationState.custom15,
  ];
  private used = new Set<AnimationState>();

  constructor(
    private characterModelLoader: CharacterModelLoader,
    private onCustomAnimationLoaded: (
      animationState: AnimationState,
      clip: AnimationClip,
      loop: boolean,
      speed: number,
    ) => void,
  ) {}

  private allocateState(requested?: AnimationState): AnimationState | null {
    if (requested) {
      if (this.used.has(requested)) return requested; // reuse same
      this.used.add(requested);
      return requested;
    }
    const free = this.availableCustomStates.find((s) => !this.used.has(s));
    if (!free) return null;
    this.used.add(free);
    return free;
  }

  public async upsertArea(
    area: AnimationArea<ThreeJSGraphicsAdapter>,
  ): Promise<AnimationState | null> {
    console.log("Upserting area:", area);
    const existing = this.areas.get(area.id);
    let allocated: AnimationState | undefined = existing?.allocatedState;
    if (!allocated) {
      if (!area.props.animationSrc) {
        return null;
      }
      const newly = this.allocateState();
      if (!newly) {
        console.warn("AnimationAreaManager: no free custom animation slots");
        return null;
      }
      allocated = newly;
    }
    const record: Area = {
      animationArea: area,
      allocatedState: allocated,
      clipLoaded: existing?.clipLoaded ?? false,
      clip: existing?.clip,
    };
    this.areas.set(area.id, record);
    // Load animation clip if not already
    if (!record.clipLoaded) {
      try {
        const clip = await this.characterModelLoader.loadAnimation(
          record.animationArea.props.animationSrc!,
        );
        if (clip) {
          record.clipLoaded = true;
          record.clip = clip;
          // Call the callback to register the animation to the character(s)
          this.onCustomAnimationLoaded(
            record.allocatedState,
            clip,
            record.animationArea.props.loop ?? true,
            record.animationArea.props.speed ?? 1.0,
          );
        }
      } catch (e) {
        console.error("AnimationAreaManager: failed to load clip", area.props.animationSrc, e);
      }
    }
    return allocated;
  }

  public removeArea(id: string) {
    const existing = this.areas.get(id);
    if (existing) {
      this.used.delete(existing.allocatedState);
      this.areas.delete(id);
      if (this.activeAreaId === id) {
        this.activeAreaId = null;
      }
    }
  }

  public clear() {
    this.areas.clear();
    this.used.clear();
    this.activeAreaId = null;
  }

  /** Get all loaded custom animations for registering to remote characters */
  public getAnimations(): Array<{
    state: AnimationState;
    clip: AnimationClip;
    loop: boolean;
    speed: number;
  }> {
    const result: Array<{
      state: AnimationState;
      clip: AnimationClip;
      loop: boolean;
      speed: number;
    }> = [];
    for (const area of this.areas.values()) {
      if (area.clipLoaded && area.clip) {
        result.push({
          state: area.allocatedState,
          clip: area.clip,
          loop: area.animationArea.props.loop ?? true,
          speed: area.animationArea.props.speed ?? 1.0,
        });
      }
    }
    return result;
  }

  private activeAreaId: string | null = null;

  /** Evaluate current position; returns an override AnimationState or null */
  public evaluate(position: Vect3): AnimationState | null {
    const hits: Array<typeof this.areas extends Map<any, infer V> ? V : never> = [] as any;
    for (const area of this.areas.values()) {
      if (area.animationArea.getContentBounds()?.containsPoint(position)) {
        hits.push(area as any);
      }
    }
    if (hits.length === 0) {
      this.activeAreaId = null;
      return null;
    }
    hits.sort(
      (a, b) => (b.animationArea.props.priority ?? 0) - (a.animationArea.props.priority ?? 0),
    );
    const top = hits[0];
    this.activeAreaId = top.animationArea.id;
    return top.allocatedState;
  }
}
