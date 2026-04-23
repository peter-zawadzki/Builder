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

export const router = createBrowserRouter([
  {
    Component: RootLayout,
    children: [
      { path: "/", Component: MountainsList },
      { path: "/admin", Component: AdminCatalog },
      { path: "/mountains/new", Component: CreateMountain },
      { path: "/mountains/:mountainId", Component: MountainDetail },
      { path: "/mountains/:mountainId/edit", Component: EditMountain },
      { path: "/mountains/:mountainId/locations/new", Component: CreateLocation },
      { path: "/mountains/:mountainId/locations/:locationId", Component: LocationDetail },
      { path: "/mountains/:mountainId/locations/:locationId/edit", Component: EditLocation },
      { path: "/mountains/:mountainId/locations/:locationId/inspection", Component: AddInspection },
      { path: "/mountains/:mountainId/locations/:locationId/assets/new", Component: AddAsset },
      { path: "/mountains/:mountainId/locations/:locationId/assets/:assetId", Component: AssetDetail },
      { path: "/mountains/:mountainId/locations/:locationId/assets/:assetId/edit", Component: AddAsset },
    ],
  },
]);