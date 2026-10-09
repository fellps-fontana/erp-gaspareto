// Metadados do último deploy, gerados no predeploy do hosting e servidos em /build-info.json.
export interface BuildInfo {
  commit: string;
  deployedAt: string;
  dirty?: boolean;
  branch?: string;
  project?: string;
}
