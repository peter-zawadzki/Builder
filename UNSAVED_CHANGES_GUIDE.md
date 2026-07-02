# Unsaved Changes Protection

This guide explains how to add unsaved changes protection to forms in the application.

## Overview

The unsaved changes protection system warns users when they try to navigate away from a form with unsaved data. It provides three options:
- **Save Changes** - Saves the form and navigates away
- **Discard Changes** - Discards changes and navigates away  
- **Cancel** - Stays on the current page

## Implementation

### 1. Import the Hook and Dialog

```tsx
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
```

### 2. Add State to Track Changes

```tsx
const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
```

### 3. Track Form Changes

Use `useEffect` to detect when form data changes:

```tsx
useEffect(() => {
  const hasData = formData.name.trim() !== '' ||
                  formData.email.trim() !== '' ||
                  // ... other fields
  setHasUnsavedChanges(hasData);
}, [formData]);
```

### 4. Clear Flag on Submit

Update your submit handler to clear the flag:

```tsx
const handleSubmit = (e?: React.FormEvent) => {
  if (e) e.preventDefault();
  
  // Validate...
  
  // Save data...
  
  setHasUnsavedChanges(false); // ← Clear the flag
  // Navigate or show success...
};
```

### 5. Use the Hook

```tsx
const { showPrompt, handleSave, handleDiscard, handleCancel } = useUnsavedChanges({
  when: hasUnsavedChanges && !savedSuccessfully, // Only block if there are unsaved changes
  message: 'You have unsaved changes. Do you want to save before leaving?',
  onSave: handleSubmit, // Your submit function
});
```

### 6. Add the Dialog

Add the dialog component to your JSX:

```tsx
<UnsavedChangesDialog
  isOpen={showPrompt}
  onSave={handleSave}
  onDiscard={handleDiscard}
  onCancel={handleCancel}
  showSaveButton={isFormValid} // Only show save button if form is valid
/>
```

## Example: Complete Integration

See `/src/app/components/CreateMountain.tsx` for a complete working example.

## Forms That Should Have This Protection

Add unsaved changes protection to these forms:
- ✅ CreateMountain
- ✅ EditMountain
- ⬜ CreateLocation
- ⬜ EditLocation
- ⬜ AddAsset
- ⬜ CreateTrail
- ⬜ AddInspection
- ⬜ ProposalBuilder
- ⬜ CustomerAgreementBuilder

To add protection to the remaining forms, follow the same pattern shown in CreateMountain.tsx and EditMountain.tsx.

## How It Works

### Browser Navigation
- Uses `beforeunload` event to warn when user tries to close tab, refresh, or navigate to external URL
- Browser shows a native confirmation dialog

### React Router Navigation
- Uses React Router's `useBlocker` hook to intercept in-app navigation
- Shows custom styled dialog matching app design

### Offline Support
- Works offline since all state is client-side
- No network requests required for the protection to work
