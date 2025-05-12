import { createRequire } from "node:module";
import process from "node:process";
import EventEmitter from "emittery";

const require = createRequire(import.meta.url);
let _mouse: { new (callback: (data: MouseData) => void): NativeMouse };
try {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  _mouse = require("../build/Release/win_mouse.node").Mouse;
} catch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    _mouse = require("@lazuee/win-mouse-win32-x64/win_mouse.node").Mouse;
  } catch {
    throw new Error("Failed to load native module win_mouse");
  }
}

export const Mouse = _mouse;

export interface NativeMouse {
  ref(): void;
  unref(): void;
  destroy(): void;
}

export type MouseType =
  | "left-down"
  | "left-up"
  | "right-down"
  | "right-up"
  | "middle-down"
  | "middle-up"
  | "move"
  | "wheel-down"
  | "wheel-up"
  | "left-drag"
  | "right-drag"
  | "middle-drag";

export interface MouseData {
  type: MouseType;
  x: number;
  y: number;
  window: {
    handle: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
    mouse: {
      x: number;
      y: number;
      isOutside: boolean;
      isWindowDrag: boolean;
    };
  };
}

export interface WinMouseEvent {
  mouse: MouseData;
  error: unknown;
}

export class WinMouse extends EventEmitter<WinMouseEvent> {
  #mouse: NativeMouse | null = null;

  constructor() {
    super();

    this.#init();
    process.prependOnceListener("exit", () => {
      this.destroy();
      this.clearListeners();
    });
  }

  ref(): void {
    this.#mouse?.ref();
  }

  unref(): void {
    this.#mouse?.unref();
  }

  destroy(): void {
    this.#mouse?.destroy();
    this.#mouse = null;
  }

  #init(): void {
    if (this.#mouse) return;
    this.#mouse = new Mouse((eventData) => {
      this.emit("mouse", eventData).catch(async (err) =>
        this.emit("error", err).catch(() => {}),
      );
    });
  }
}
