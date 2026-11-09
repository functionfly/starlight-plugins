// Type declarations for virtual:starlight-announcement/config
declare module "virtual:starlight-announcement/config" {
  import type { AnnouncementConfig } from "./schemas/config";

  export const announcements: AnnouncementConfig[];
  export const displayMode: "all" | "first" | "rotate";
  export const rotateInterval: number;
  export const showRotateIndicator: boolean;
  export const iconSize: number;
  export const closeOnNavigate: boolean;
}
