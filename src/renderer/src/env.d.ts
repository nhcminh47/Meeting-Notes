import type { LocalStudioApi } from "../../shared/apiTypes";

declare global {
  interface Window {
    localStudio: LocalStudioApi;
  }
}

export {};
