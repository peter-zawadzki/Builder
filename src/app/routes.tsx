import { createBrowserRouter } from "react-router";
import { RootLayout } from "./components/RootLayout";
import { MountainsList } from "./components/MountainsList";
import { MountainDetail } from "./components/MountainDetail";
import { LocationDetail } from "./components/LocationDetail";
import { AddAsset } from "./components/AddAsset";
import { AssetDetail } from "./components/AssetDetail";
import { CreateMountain } from "./components/CreateMountain";
import { EditMountain } from "./components/EditMountain";
import { CreateLocation } from "./components/CreateLocation";
import { EditLocation } from "./components/EditLocation";
import { AddInspection } from "./components/AddInspection";
import { AdminCatalog } from "./components/AdminCatalog";
import { ProposalBuilder } from "./components/ProposalBuilder";
import { InvoiceViewer } from "./components/InvoiceViewer";
import { CreateTrail } from "./components/CreateTrail";
import { TrailDetail } from "./components/TrailDetail";
import { SigningPage } from "./components/SigningPage";
import { CustomerAgreementBuilder } from "./components/CustomerAgreementBuilder";
import { CustomerAgreementSignPage } from "./components/CustomerAgreementSignPage";
import { CRMSection } from "./components/crm/CRM";
import { MountainPortal } from "./components/MountainPortal";
import { ClerkRoot } from "./components/ClerkRoot";
import { SignInPage } from "./components/SignInPage";
import { SignUpPage } from "./components/SignUpPage";
import { TeamPage } from "./components/TeamPage";
import { SystemCheck } from "./components/SystemCheck";

export const router = createBrowserRouter([
  {
    // Clerk lives here (inside the router) so it navigates via React Router.
    Component: ClerkRoot,
    children: [
      // ── Public pages (no app chrome, no auth) ────────────────────────────────
      {
        // Sign-in surface for the gate and Clerk redirects. Splat so Clerk's
        // multi-step sub-paths resolve here.
        path: "/sign-in/*",
        Component: SignInPage,
      },
      {
        // Invitation landing — Clerk <SignUp/> handles the ticket. Splat so
        // Clerk's multi-step sub-paths (verify-email, sso-callback) resolve here.
        path: "/sign-up/*",
        Component: SignUpPage,
      },
      {
        path: "/portal/:mountainId",
        Component: MountainPortal,
      },
      {
        path: "/sign/:token",
        Component: SigningPage,
      },
      {
        path: "/agreement-sign/:token",
        Component: CustomerAgreementSignPage,
      },
      // ── Main app ───────────────────────────────────────────────────────────
      {
        Component: RootLayout,
        children: [
          { path: "/", Component: MountainsList },
          { path: "/admin", Component: AdminCatalog },
          { path: "/crm", Component: CRMSection },
          { path: "/team/*", Component: TeamPage },
          { path: "/system-check", Component: SystemCheck },
          { path: "/mountains/new", Component: CreateMountain },
          { path: "/mountains/:mountainId", Component: MountainDetail },
          { path: "/mountains/:mountainId/edit", Component: EditMountain },
          { path: "/mountains/:mountainId/proposal", Component: ProposalBuilder },
          { path: "/mountains/:mountainId/agreement", Component: CustomerAgreementBuilder },
          { path: "/mountains/:mountainId/invoice", Component: InvoiceViewer },
          // ── Trails ────────────────────────────────────────────────────────
          { path: "/mountains/:mountainId/trails/new", Component: CreateTrail },
          { path: "/mountains/:mountainId/trails/:trailId", Component: TrailDetail },
          { path: "/mountains/:mountainId/trails/:trailId/locations/new", Component: CreateLocation },
          // ── Inventory (mountain-level asset creation) ─────────────────────
          { path: "/mountains/:mountainId/inventory/new", Component: AddAsset },
          // ── Locations ─────────────────────────────────────────────────────
          { path: "/mountains/:mountainId/locations/new", Component: CreateLocation },
          { path: "/mountains/:mountainId/locations/:locationId", Component: LocationDetail },
          { path: "/mountains/:mountainId/locations/:locationId/edit", Component: EditLocation },
          { path: "/mountains/:mountainId/locations/:locationId/inspection", Component: AddInspection },
          { path: "/mountains/:mountainId/locations/:locationId/assets/new", Component: AddAsset },
          { path: "/mountains/:mountainId/locations/:locationId/assets/:assetId", Component: AssetDetail },
          { path: "/mountains/:mountainId/locations/:locationId/assets/:assetId/edit", Component: AddAsset },
        ],
      },
    ],
  },
]);