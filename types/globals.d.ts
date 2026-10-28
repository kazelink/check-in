declare module '*/squire.mjs' {
  export default class Squire {
    constructor(root: HTMLElement, options?: Record<string, any>);
    [key: string]: any;
  }
}

interface Window {
  Lunar: any;
  HolidayUtil: any;
}

declare const Swal: any;

type AppBindings = {
  Bindings: {
    DB: any;
    APP_PASSWORD?: string;
    JWT_SECRET?: string;
  };
};

interface EventTarget {
  closest(selectors: string): Element | null;
  value?: string;
  dataset: DOMStringMap;
  focus(options?: any): void;
  select(): void;
  disabled: boolean;
}

interface Element {
  value?: string;
  dataset: DOMStringMap;
  disabled: boolean;
  focus(options?: any): void;
  select(): void;
}
