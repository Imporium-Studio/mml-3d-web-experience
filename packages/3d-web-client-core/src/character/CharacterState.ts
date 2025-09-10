export enum AnimationState {
  "idle" = 0,
  "walking" = 1,
  "running" = 2,
  "jumpToAir" = 3,
  "air" = 4,
  "airToGround" = 5,
  "doubleJump" = 6,
  // Custom animation slots (network-safe numeric codes)
  "custom0" = 7,
  "custom1" = 8,
  "custom2" = 9,
  "custom3" = 10,
  "custom4" = 11,
  "custom5" = 12,
  "custom6" = 13,
  "custom7" = 14,
  "custom8" = 15,
  "custom9" = 16,
  "custom10" = 17,
  "custom11" = 18,
  "custom12" = 19,
  "custom13" = 20,
  "custom14" = 21,
  "custom15" = 22,
}

export type CharacterState = {
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: {
    quaternionY: number;
    quaternionW: number;
  };
  state: AnimationState;
};
