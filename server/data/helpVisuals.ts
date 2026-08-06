// Deterministic keyword match from a question to pre-captured screenshot(s) of
// the relevant UI flow (see scripts/captureHelpShots.ts). Matching happens
// server-side against plain keywords, NOT the model, so there's no risk of it
// hallucinating an image path — same tradeoff as the FAQ tab's own keyword
// search in ResourceCenter.tsx, just ported here.
//
// Highlight boxes are captured as percentages of the 1400x900 capture
// viewport (see scripts/captureHelpShots.ts), not baked into the image, so
// the frontend can render them pixel-accurately at any display size —
// chat-bubble width or full-screen.
export interface HelpVisualHighlight {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  label?: string;
}

export interface HelpVisualStep {
  imagePath: string; // served from public/resource-assets/help-visuals/
  caption: string;
  highlights?: HelpVisualHighlight[];
}

export interface HelpVisual {
  key: string;
  label: string;
  keywords: string[];
  steps: HelpVisualStep[]; // 1 step for simple flows, several for multi-stage ones
}

export const HELP_VISUALS: HelpVisual[] = [
  {
    key: "add-mountain",
    label: "Adding a mountain",
    keywords: ["add a mountain", "add mountain", "new mountain", "create a mountain", "create mountain"],
    steps: [
      {
        imagePath: "/resource-assets/help-visuals/add-mountain.png",
        caption: "Fill in the mountain's name, address, and region (all required), then click \"Add Mountain\" at the bottom of the form.",
      },
    ],
  },
  {
    key: "add-contact",
    label: "Adding a contact",
    keywords: ["add a contact", "add contact", "new contact", "create a contact", "create contact"],
    steps: [
      {
        imagePath: "/resource-assets/help-visuals/add-contact.png",
        caption: "From People & Contacts, click \"Add\", fill in first name, last name, and email (required), then Save.",
      },
    ],
  },
  {
    key: "create-project",
    label: "Creating a project",
    keywords: ["create a project", "create project", "new project", "add a project", "add project"],
    steps: [
      {
        imagePath: "/resource-assets/help-visuals/create-project.png",
        caption: "On a mountain's page, click \"New\" in the Projects panel, name it and pick a type, then click Create.",
      },
    ],
  },
  {
    key: "create-proposal",
    label: "Creating a proposal",
    keywords: ["create a proposal", "create proposal", "new proposal", "add a proposal", "build a proposal"],
    steps: [
      {
        imagePath: "/resource-assets/help-visuals/create-proposal.png",
        caption: "Click \"New\" in the Proposals panel and pick which project the proposal is for (one proposal per project).",
      },
      {
        imagePath: "/resource-assets/help-visuals/create-proposal-builder.png",
        caption: "That opens the Proposal Builder, where you fill in line items, pricing, and terms before sending it.",
      },
    ],
  },
  {
    key: "site-assessment",
    label: "Doing a site assessment",
    keywords: ["site assessment", "site inspection", "assess a trail", "assessment workspace"],
    steps: [
      {
        imagePath: "/resource-assets/help-visuals/site-assessment-trail.png",
        caption: "From a trail's page, click \"Add Assessment\" (or \"View Assessment\" if one already exists) to open its map workspace.",
        highlights: [
          { xPct: 27.14, yPct: 28.33, wPct: 45.71, hPct: 5.33, label: "Add Assessment" },
        ],
      },
      {
        imagePath: "/resource-assets/help-visuals/site-assessment-toolbar.png",
        caption: "Use the left toolbar to place devices on the map: pick a tool, then click the map where that device sits.",
        highlights: [
          { xPct: 1.57, yPct: 17.61, wPct: 3.14, hPct: 4.89, label: "Select" },
          { xPct: 1.57, yPct: 22.94, wPct: 3.14, hPct: 4.89, label: "Camera" },
          { xPct: 1.57, yPct: 28.28, wPct: 3.14, hPct: 4.89, label: "Server" },
          { xPct: 1.57, yPct: 33.61, wPct: 3.14, hPct: 4.89, label: "Network Device" },
          { xPct: 1.57, yPct: 38.94, wPct: 3.14, hPct: 4.89, label: "Power Source" },
          { xPct: 1.57, yPct: 44.28, wPct: 3.14, hPct: 4.89, label: "Building" },
          { xPct: 1.57, yPct: 49.61, wPct: 3.14, hPct: 4.89, label: "Miscellaneous" },
          { xPct: 1.57, yPct: 54.94, wPct: 3.14, hPct: 4.89, label: "Start/Finish" },
          { xPct: 1.57, yPct: 61.28, wPct: 3.14, hPct: 4.89, label: "Measure distance" },
        ],
      },
    ],
  },
  {
    key: "action-items",
    label: "Assigning action items",
    keywords: ["action item", "assign a task", "assign an action", "action items"],
    steps: [
      {
        imagePath: "/resource-assets/help-visuals/action-items.png",
        caption: "Click \"New\" next to Next Actions, describe the task, optionally assign it to a teammate, then Add.",
      },
    ],
  },
  {
    key: "update-status",
    label: "Updating statuses",
    keywords: ["update status", "update the status", "change status", "change the stage", "pipeline stage", "project stage"],
    steps: [
      {
        imagePath: "/resource-assets/help-visuals/update-status.png",
        caption: "Open a project and click through the Stage dots to cycle each stage between not-started, blocked, in-progress, and done.",
      },
    ],
  },
];

export function matchHelpVisuals(question: string, answerText: string): HelpVisual[] {
  const haystack = `${question} ${answerText}`.toLowerCase();
  return HELP_VISUALS.filter((v) => v.keywords.some((k) => haystack.includes(k)));
}
