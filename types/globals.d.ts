// 全局类型补充：第三方库、浏览器扩展属性与事件委托的常见形态

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

// 由 public/assets/sweetalert2.all.min.js 提供的全局对象
declare const Swal: any;

// Worker 运行时绑定
type AppBindings = {
  Bindings: {
    DB: any;
    APP_PASSWORD?: string;
    JWT_SECRET?: string;
  };
};

// 事件委托里 e.target 实际是元素，而 DOM 类型只给出 EventTarget
interface EventTarget {
  closest(selectors: string): Element | null;
  value?: string;
  dataset: DOMStringMap;
  focus(options?: any): void;
  select(): void;
  disabled: boolean;
}

// 项目里通过 id/选择器取到的都是表单控件或可聚焦元素
interface Element {
  value?: string;
  dataset: DOMStringMap;
  disabled: boolean;
  focus(options?: any): void;
  select(): void;
}
