// Manifest for the Resource Center's Demo Hub tab. Media lives in
// public/resource-assets/demo-hub/ (copied in from a demo build), so these
// are root-relative public paths, not imports — same pattern as logoAssets.ts.
export interface DemoLink {
  label: string;
  tag: string;
  href: string;
  external: boolean;
}

const BASE = '/resource-assets/demo-hub';

export const DEMO_LINKS: DemoLink[] = [
  { label: 'Production', tag: 'Live', href: 'https://yullr.com', external: true },
  { label: 'Portal', tag: 'Live', href: 'https://portal.yullr.com', external: true },
  { label: 'Development', tag: 'Dev', href: 'https://dev-app.yullr.com/mountains/172?from=%2Fvideos%2F', external: true },
  { label: 'Live Video Sample', tag: 'MP4', href: `${BASE}/videos/yullr_live_720.mp4`, external: false },
  { label: 'YULLR Pose', tag: 'MP4', href: `${BASE}/videos/celine-5-pose.mp4`, external: false },
  { label: 'YULLR Analysis', tag: 'HTML', href: `${BASE}/pages/insights.html`, external: false },
  { label: 'Raw Data', tag: 'DATA', href: `${BASE}/pages/Raw Data.html`, external: false },
  { label: 'Night Footage', tag: 'Dev', href: 'https://dev-app.yullr.com/videos/200634', external: true },
  { label: 'YULLR Monitor', tag: 'Live', href: 'https://portal.yullr.com/monitor/', external: true },
];

export interface PipelineStep {
  label: string;
  file: string;
}

export const PIPELINE_STEPS: PipelineStep[] = [
  { label: 'Capture', file: `${BASE}/videos/celine-1-video.mp4` },
  { label: 'Detect', file: `${BASE}/videos/celine-2-detection.mp4` },
  { label: 'Process', file: `${BASE}/videos/celine-3-corridor.mp4` },
  { label: 'Deliver', file: `${BASE}/videos/celine-4-zoom.mp4` },
];

export interface DemoSlide {
  label: string;
  file: string;
}

export const DEMO_SLIDES: DemoSlide[] = [
  { label: 'Cameras', file: `${BASE}/slides/1.jpg` },
  { label: 'Install', file: `${BASE}/slides/2.jpg` },
  { label: 'Remote', file: `${BASE}/slides/3.jpg` },
  { label: 'Live View', file: `${BASE}/slides/4.jpg` },
  { label: 'Lodge', file: `${BASE}/slides/5.jpg` },
  { label: 'Racers', file: `${BASE}/slides/6.jpg` },
  { label: 'Racers', file: `${BASE}/slides/7.jpg` },
  { label: 'Server', file: `${BASE}/slides/8.jpg` },
  { label: 'Stromotion', file: `${BASE}/slides/9.jpg` },
  { label: 'Optimal Line', file: `${BASE}/slides/10.jpg` },
];
