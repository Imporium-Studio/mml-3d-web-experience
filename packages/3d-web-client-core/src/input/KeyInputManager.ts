import { EventHandlerCollection } from "./EventHandlerCollection";

export enum Key {
  W = "w",
  A = "a",
  S = "s",
  D = "d",
  SHIFT = "shift",
  SPACE = " ",
  C = "c",
}

export const ALLOWED_CODES = [
  "KeyW", "KeyA", "KeyS", "KeyD",
  "Space", "ShiftLeft", "ShiftRight",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Enter", "Escape", "KeyF" // add anything you actually support
] as const;

export type KeyCode = typeof ALLOWED_CODES[number];


type KeyCallback = () => void;
type BindingsType = Map<Key, KeyCallback>;

type ExtCallback = () => void;

export interface KeyBindingOptions {
  onDown?: ExtCallback;
  onUp?: ExtCallback;
  onHold?: ExtCallback;
  repeat?: boolean;
  preventDefault?: boolean;
}

type BindingBucket = KeyBindingOptions[];
type CodeBindingMap = Map<KeyboardEvent["code"], BindingBucket>;

export interface KeyInputManagerOptions {
  shouldCaptureKeyPress?: () => boolean;
  target?: Document | HTMLElement;
}

export class KeyInputManager {
  private keys = new Map<KeyboardEvent["code"], boolean>();
  private eventHandlerCollection = new EventHandlerCollection();
  private bindings: BindingsType = new Map();
  private enabled: boolean = false;

  private codeBindings: CodeBindingMap = new Map();
  private pressedMain = new Set<KeyboardEvent["code"]>();
  private shouldCaptureKeyPress: () => boolean;
  private target: Document | HTMLElement;

  constructor(shouldCaptureKeyPressOrOpts: (() => boolean) | KeyInputManagerOptions = () => true) {
    if (typeof shouldCaptureKeyPressOrOpts === "function") {
      this.shouldCaptureKeyPress = shouldCaptureKeyPressOrOpts;
      this.target = document;
    } else {
      const opts = shouldCaptureKeyPressOrOpts as KeyInputManagerOptions;
      this.shouldCaptureKeyPress = opts.shouldCaptureKeyPress ?? (() => true);
      this.target = opts.target ?? document;
    }
    this.eventHandlerCollection.add(this.target, "keydown", this.onKeyDown.bind(this));
    this.eventHandlerCollection.add(this.target, "keyup", this.onKeyUp.bind(this));
    this.eventHandlerCollection.add(window, "blur", this.handleUnfocus.bind(this));
  }

  public enable(): void {
    this.enabled = true;
  }

  public disable(): void {
    this.enabled = false;
    this.handleUnfocus(); // clear state so keys don't stay "down"
  }

  public setEnabled(flag: boolean): void {
    if (!flag && this.enabled) this.handleUnfocus();
    this.enabled = flag;
  }

  private handleUnfocus(): void {
    this.keys.clear();
    this.pressedMain.clear();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) return;
    if (this.shouldCaptureKeyPress()) {
      this.keys.set(event.code, true);
      event.preventDefault();
    }

    const code = event.code;
    const firstPress = !this.pressedMain.has(code);
    this.pressedMain.add(code);

    const bucket = this.codeBindings.get(code);
    if (!bucket) return;

    for (const b of bucket) {
      if (event.repeat) {
        if (b.repeat) {
          b.onDown?.();
          b.onHold?.();
        }
      } else {
        b.onDown?.();
        if (!firstPress) b.onHold?.();
      }
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (!this.enabled) return;
    this.keys.set(event.code, false);
    if (this.bindings.has(event.key.toLowerCase() as Key)) {
      this.bindings.get(event.key.toLowerCase() as Key)!();
    }

    const code = event.code;
    this.pressedMain.delete(code);
    const bucket = this.codeBindings.get(code);
    if (!bucket) return;
    for (const b of bucket) b.onUp?.();
  }

  public isKeyPressed(code: KeyboardEvent["code"]): boolean {
    if (!this.enabled) return false;
    return this.keys.get(code) || false;
  }

  public createKeyBinding(key: Key, callback: () => void): void {
    if (this.bindings.has(key)) return;
    this.bindings.set(key, callback);
  }

  public removeKeyBinding(key: Key): void {
    if (!this.bindings.has(key)) return;
    this.bindings.delete(key);
  }

  public isMovementKeyPressed(): boolean {
    return [Key.W, Key.A, Key.S, Key.D].some((key) => this.isKeyPressed(key));
  }

  private getForward(): boolean {
    return this.isKeyPressed("KeyW");
  }

  private getBackward(): boolean {
    return this.isKeyPressed("KeyS");
  }

  private getLeft(): boolean {
    return this.isKeyPressed("KeyA");
  }

  private getRight(): boolean {
    return this.isKeyPressed("KeyD");
  }

  private getRun(): boolean {
    return this.isKeyPressed("ShiftLeft") || this.isKeyPressed("ShiftRight");
  }

  private getJump(): boolean {
    return this.isKeyPressed("Space");
  }

  public getOutput(): { direction: number | null; isSprinting: boolean; jump: boolean } | null {
    if (!this.enabled) return null;
    const dx = (this.getRight() ? 1 : 0) - (this.getLeft() ? 1 : 0);
    const dy = (this.getBackward() ? 1 : 0) - (this.getForward() ? 1 : 0);
    const jump = this.getJump();
    if (dx === 0 && dy === 0) {
      if (jump) return { direction: null, isSprinting: false, jump };
      return null;
    }
    const direction = Math.atan2(dx, dy);
    return { direction, isSprinting: this.getRun(), jump };
  }

  public dispose() {
    this.eventHandlerCollection.clear();
    this.bindings.clear();
    this.codeBindings.clear();
    this.pressedMain.clear();
    this.keys.clear();
  }

  public bindKey(code: KeyboardEvent["code"], options: KeyBindingOptions): void {
    const bucket = this.codeBindings.get(code) ?? [];
    bucket.push(options);
    this.codeBindings.set(code, bucket);
  }

  public unbindKey(code: KeyboardEvent["code"], options?: KeyBindingOptions): void {
    if (!this.codeBindings.has(code)) return;
    if (!options) {
      this.codeBindings.delete(code);
      return;
    }
    const bucket = this.codeBindings.get(code)!.filter((b) => b !== options);
    if (bucket.length) this.codeBindings.set(code, bucket);
    else this.codeBindings.delete(code);
  }

  public remapKey(from: KeyboardEvent["code"], to: KeyboardEvent["code"]): void {
    const handlers = this.codeBindings.get(from);
    if (!handlers) return;
    this.codeBindings.delete(from);
    const bucket = this.codeBindings.get(to) ?? [];
    this.codeBindings.set(to, bucket.concat(handlers));
  }
}
