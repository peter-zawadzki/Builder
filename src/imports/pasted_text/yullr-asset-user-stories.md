YULLR Asset Management Tool — User Stories

Purpose

A single system of record for all YULLR physical equipment — every item carries a unique YULLR Inventory Number and a mountain deployment, can be created with smart capture (UPC/serial scanning), and individual items can be assembled into composite "servers."

Roles


Inventory Manager / Admin — full create/edit/delete, manages dropdown values.
Field Technician — adds items, scans, builds servers, updates deployment from the field (often mobile).
Viewer — read-only access to inventory and reports.



Data Model (reference)

Every asset record includes:

FieldTypeNotesYULLR Inventory NumberAuto-generated, uniqueUniversal — assigned to every item AND every serverCategoryDropdown (required)See list belowSubcategoryDependent dropdownOptions driven by selected categoryManufacturerTextModelTextSerial NumberTextScannable via OCRUPCText / barcodeScannable; can trigger prefillDate of PurchaseDateVendorText / dropdownCostCurrencyImage(s)File uploadOne or moreMountain DeploymentDropdownUniversalStatusDropdowne.g. In Stock, Deployed, In a Build, Retired — suggested addition

Categories & proposed subcategories (editable by Admin):


Server Hardware — CPU, GPU, RAM, Motherboard, Storage (SSD/HDD), Power Supply, Chassis/Case, Cooling, Complete Server
Network Equipment — Switch, Router, Access Point, PoE Injector, Media Converter, Firewall/Gateway, Cabling
Cameras — PTZ Camera, Fixed Camera, Lens, Mount/Housing, NVR/Recorder
Miscellaneous Hard Goods — Cables, Mounts/Brackets, Power/Transformers, Tools, Enclosures, Other


Mountain Deployment options (your current live + dev sites): Pats Peak, Wachusett, Cranmore, Waterville, Ski Ward, Burke, Berkshire East, Attitash, DEMO, Unassigned / Warehouse.


Epic 1 — Add & Manage an Asset

US-1.1 — Add an item
As an Inventory Manager, I want to create a new asset record with all its details so that every piece of equipment is tracked in one place.


Acceptance:

Form captures all fields in the data model.
Category is required; Subcategory list updates based on the selected Category.
A unique YULLR Inventory Number is auto-generated and shown on save.
Cost accepts currency formatting; Date of Purchase uses a date picker.





US-1.2 — Edit / retire an item
As an Inventory Manager, I want to edit any field or mark an item as Retired so that records stay accurate over the equipment's life.


Acceptance:

All fields editable except the YULLR Inventory Number.
Retiring an item removes it from "available to build" lists but preserves history.





US-1.3 — Search & filter inventory
As any user, I want to search and filter assets (by category, manufacturer, mountain, status, serial, inventory number) so that I can find equipment quickly.


Acceptance:

Free-text search across manufacturer, model, serial, UPC, and inventory number.
Filters combine (e.g. "Cameras at Cranmore, Deployed").






Epic 2 — YULLR Inventory Number (Universal)

US-2.1 — Auto-assign inventory number to every asset
As an Inventory Manager, I want every item and every server to receive a unique YULLR Inventory Number automatically so that nothing is tracked by serial number alone.


Acceptance:

Number is generated on record creation and is guaranteed unique.
Format is consistent and human-readable (e.g. YIN-000123); recommend an optional category prefix like YIN-CAM-000123 — flag if you want this.
Number is printable/exportable for physical labeling (barcode/QR optional but recommended).






Epic 3 — Mountain Deployment (Universal)

US-3.1 — Assign deployment location
As a Field Technician, I want to set or change the mountain an asset is deployed to so that we know where every piece of equipment physically is.


Acceptance:

Mountain is a selectable field on every asset and every server.
Default is "Unassigned / Warehouse" until deployed.
Changing deployment is logged (who/when) for an audit trail.





US-3.2 — View equipment by mountain
As an Inventory Manager, I want to see all equipment grouped by mountain so that I can audit what's on-site.


Acceptance:

A per-mountain view lists all assets and servers deployed there with totals (count and cost).






Epic 4 — Image Upload

US-4.1 — Upload item image
As a Field Technician, I want to upload or take a photo of an item so that records have a visual reference.


Acceptance:

Supports upload from file or device camera (mobile-friendly).
At least one image per asset; multiple images supported.
Images stored and displayed on the asset detail view (storage to S3 to match your stack).






Epic 5 — Smart Capture (UPC & Serial)

US-5.1 — Scan UPC to prefill
As a Field Technician, I want to photograph/scan an item's UPC so that available product details prefill automatically and I type less.


Acceptance:

Camera scans a UPC barcode and captures the number into the UPC field.
System queries a product database and prefills Manufacturer, Model, and Category/Subcategory where a match exists.
Prefilled fields remain editable; the tech confirms before saving.
Caveat to flag: consumer UPC databases (e.g. UPCitemdb, Barcode Lookup) cover retail goods well but frequently do not carry enterprise gear like Dahua PTZ cameras or server components. Realistic behavior: prefill when found, fall back to manual entry when not. Worth budgeting for a paid lookup API and graceful "no match" handling.





US-5.2 — Scan serial number via OCR
As a Field Technician, I want to take a photo of the serial number label so that it's read and entered automatically.


Acceptance:

Camera captures the label; OCR extracts text into the Serial Number field.
Extracted value is editable for correction.
Works on common label formats; recommend keeping the captured photo attached to the record for verification.






Epic 6 — Server Builder (Composite Assets)

US-6.1 — Create a server build
As an Inventory Manager, I want to create a server by assigning existing inventory items to it so that a deployed machine is tracked as one unit made of known parts.


Acceptance:

A server is its own record with: YULLR Inventory Number, image, build date, mountain deployment, and a list of assigned component items.
Only existing in-stock assets can be assigned.





US-6.2 — Assign / remove components
As an Inventory Manager, I want to add or remove inventory items from a server build so that the build reflects reality.


Acceptance:

Assigning an item links it to the server and sets its status to "In a Build."
An item can belong to only one server at a time.
Removing a component returns it to "In Stock."





US-6.3 — Deployment roll-up
As an Inventory Manager, I want a server's components to follow the server's mountain deployment so that I don't update each part individually.


Acceptance:

Setting/changing the server's mountain updates the deployment of all assigned components.
The per-mountain view shows the server and its parts together.





US-6.4 — View a server's bill of materials
As any user, I want to open a server and see every component (with serials, models, cost) so that I know exactly what's inside a deployed machine.


Acceptance:

Server detail view lists all components with key fields and a total build cost (sum of component costs).






Suggested additions (flagging for your call)


Status field on every asset (In Stock / Deployed / In a Build / Retired) — makes the server builder and "available to assign" logic clean. Used throughout the stories above.
Audit log of who changed deployment/assignment and when.
Label printing (barcode or QR encoding the YULLR Inventory Number) so a quick scan in the field pulls up the record.
Total cost roll-ups per mountain and per server for asset valuation / insurance.