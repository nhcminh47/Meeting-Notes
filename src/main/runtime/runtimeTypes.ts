export type RuntimeItemStatus =
  | "missing"
  | "downloading"
  | "extracting"
  | "ready"
  | "error";

export type RuntimeItemType = "zip" | "file";

export type RuntimeManifestItem = {
  id: string;
  type: RuntimeItemType;
  url: string;
  sha256: string;
  sizeBytes?: number;
  outputPath?: string;
  extractTo?: string;
  expectedFiles?: string[];
  optional?: boolean;
};

export type RuntimeManifest = {
  runtimeVersion: string;
  platform: "win32-x64";
  items: Record<string, RuntimeManifestItem>;
};

export type RuntimeStatusItem = {
  id: string;
  status: RuntimeItemStatus;
  localPath?: string;
  progress?: number;
  error?: string;
};

export type RuntimeStatus = {
  runtimeVersion: string;
  items: Record<string, RuntimeStatusItem>;
};

export type LocalRuntimeManifest = {
  runtimeVersion: string;
  installedAt: string;
  items: Record<
    string,
    {
      id: string;
      sha256: string;
      localPath: string;
      installedAt: string;
    }
  >;
};
