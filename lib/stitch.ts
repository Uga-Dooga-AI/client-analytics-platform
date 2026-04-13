import stitchProvenance from "@/config/stitch-provenance.json";

export type StitchRouteStatus = "backed" | "prompt_ready" | "pending";

type StitchRouteEntry = {
  page: string;
  status: StitchRouteStatus;
  artifact: string;
  wave: number;
};

type StitchManifest = {
  projectId: string;
  sitePlan: string;
  designSystem: string;
  baton: string;
  routes: Record<string, StitchRouteEntry>;
};

const manifest = stitchProvenance as StitchManifest;

const routeCandidates = Object.keys(manifest.routes).sort((a, b) => b.length - a.length);

export function getStitchRoute(pathname: string) {
  const match = routeCandidates.find((route) => {
    if (route === pathname) {
      return true;
    }

    if (!route.includes("[")) {
      return pathname.startsWith(`${route}/`);
    }

    const routeParts = route.split("/");
    const pathParts = pathname.split("/");

    if (routeParts.length !== pathParts.length) {
      return false;
    }

    return routeParts.every((part, index) => part.startsWith("[") || part === pathParts[index]);
  });

  if (!match) {
    return null;
  }

  return { route: match, ...manifest.routes[match] };
}

export function getStitchStatusMeta(status: StitchRouteStatus) {
  switch (status) {
    case "backed":
      return {
        label: "Google Stitch-backed",
        color: "var(--color-success)",
      };
    case "prompt_ready":
      return {
        label: "Stitch prompt ready",
        color: "var(--color-warning)",
      };
    case "pending":
      return {
        label: "Stitch pending",
        color: "var(--color-ink-500)",
      };
  }
}

export const STITCH_PROJECT_ID = manifest.projectId;
export const STITCH_MANIFEST = manifest;
