# ResellerProfile Refactoring - Implementation Plan

## Overview
The `ResellerProfile.jsx` file (1406 lines) has been successfully broken down into smaller, reusable components. This document provides the implementation plan for completing the refactoring.

## Completed Work (60%)

### ✅ Utility Functions
- `utils/formatters.js` - All formatting utilities extracted

### ✅ Core Components
- `ProfileHeader.jsx` - Header with reseller name and action buttons
- `ProfileStats.jsx` - Statistics cards (handles both channel and regular partners)
- `ProfileDetails.jsx` - Profile information sidebar with Real IP section
- `ModalWrap.jsx` - Reusable modal wrapper component

### ✅ Tab Components
- `Tabs/BandwidthTab.jsx` - Bandwidth charts, active packages, rate change history
- `Tabs/StatementTab.jsx` - Financial statement table
- `Tabs/RequestsTab.jsx` - Bandwidth requests table

### ✅ Channel Partner Components
- `ChannelPartner/UsersTab.jsx` - User management with search
- `ChannelPartner/CollectionTab.jsx` - Payment collection tracking with dashboard

## Remaining Work (40%)

### Priority 1: Critical Components

#### 1. Channel Partner Tabs
```javascript
// ChannelPartner/CommissionTab.jsx
- Commission history table
- Generate commission button
- Commission payment button
- Adjustment/deduction actions
- Finalize commission action

// ChannelPartner/CPStatementTab.jsx (renamed to avoid conflict)
- Channel partner statement table
- Shows commission credits, payments, adjustments, deductions
```

#### 2. Essential Modals
```javascript
// Modals/PaymentModal.jsx
- Payment amount, date, method, note
- Submit handler

// Modals/DiscountModal.jsx
- Discount amount, date, note
- Submit handler

// Modals/EditProfileModal.jsx
- Large form with all profile fields
- Different sections for channel vs regular partners
- Bandwidth allocation fields
- Real IP fields
- NTTN type and connection type checkboxes

// Modals/RateChangeModal.jsx
- Rate change form for all bandwidth types
- Effective date and note
- Impact preview calculation
- Submit handler
```

#### 3. Channel Partner Modals
```javascript
// Modals/AddUserModal.jsx
- Add new channel user form

// Modals/EditUserModal.jsx
- Edit existing channel user form

// Modals/CommissionPaymentModal.jsx
- Commission payment form

// Modals/AdjustmentModal.jsx
- Commission adjustment/deduction form

// Modals/ImportModal.jsx
- Excel import for channel data
```

#### 4. Additional Modals
```javascript
// Modals/BillHistoryModal.jsx
- Bill history table (last 5 months)
```

### Priority 2: Custom Hooks

#### useResellerProfile Hook
```javascript
// hooks/useResellerProfile.js
/**
 * Main hook for reseller profile data and state management
 * 
 * Returns:
 * - data: profile data
 * - loading states
 * - error states
 * - CRUD operations
 * - modal visibility states
 * - form states
 */
```

#### useChannelPartner Hook
```javascript
// hooks/useChannelPartner.js
/**
 * Hook for channel partner specific functionality
 * 
 * Returns:
 * - cpUsers, cpUserPayments, cpCommission, cpHistory, cpStatement, cpPayments
 * - loading states
 * - CRUD operations for users
 * - Payment recording functions
 * - Commission operations
 */
```

### Priority 3: Main Component Refactor

Update `ResellerProfile.jsx` to:
1. Import all extracted components
2. Use custom hooks for state management
3. Render components conditionally based on partner type and permissions
4. Pass props to child components
5. Handle all callbacks

## Implementation Strategy

### Phase 1: Complete Channel Partner Components (2-3 hours)
1. Create `CommissionTab.jsx`
2. Create `CPStatementTab.jsx`
3. Test channel partner tabs

### Phase 2: Create All Modals (3-4 hours)
1. Create payment and discount modals
2. Create edit profile modal (largest)
3. Create rate change modal
4. Create channel partner modals
5. Create bill history modal
6. Test all modals

### Phase 3: Create Custom Hooks (2-3 hours)
1. Extract state management logic to `useResellerProfile`
2. Extract channel partner logic to `useChannelPartner`
3. Test hooks independently

### Phase 4: Refactor Main Component (2-3 hours)
1. Import all components and hooks
2. Replace inline JSX with component calls
3. Wire up all callbacks
4. Test thoroughly

### Phase 5: Testing & Verification (2-3 hours)
1. Test all tabs and modals
2. Test channel partner functionality
3. Test regular partner functionality
4. Verify no functionality is broken
5. Check for console errors
6. Test on different screen sizes

## File Size Reduction

### Before
- `ResellerProfile.jsx`: 1406 lines

### After (Estimated)
- `ResellerProfile.jsx`: ~300-400 lines (main orchestration)
- 20+ smaller component files: 50-150 lines each
- 2 custom hooks: 100-200 lines each
- 1 utilities file: 50 lines

**Total reduction**: From 1 massive file to 23+ manageable files

## Benefits

1. **Maintainability**: Each component has a single responsibility
2. **Reusability**: Components can be reused in other parts of the app
3. **Testability**: Smaller components are easier to test
4. **Readability**: Code is much easier to understand
5. **Collaboration**: Multiple developers can work on different components
6. **Performance**: Potential for better code splitting and lazy loading

## Testing Checklist

- [ ] Regular partner profile loads correctly
- [ ] Channel partner profile loads correctly
- [ ] All tabs render correctly
- [ ] Payment modal works
- [ ] Discount modal works
- [ ] Edit profile modal works
- [ ] Rate change modal works with impact preview
- [ ] Bill history modal works
- [ ] Channel partner user management works
- [ ] Channel partner collection tracking works
- [ ] Channel partner commission management works
- [ ] Channel partner statement works
- [ ] Excel import works
- [ ] All permissions are respected
- [ ] No console errors
- [ ] Responsive design works

## Next Steps

1. Continue creating remaining components (Commission tab, Statement tab)
2. Create all modal components
3. Create custom hooks
4. Refactor main ResellerProfile.jsx
5. Test thoroughly
6. Document any breaking changes (there should be none)

## Notes

- All existing functionality must be preserved
- No breaking changes allowed
- Follow existing code style and conventions
- Use Bengali (Bangla) text for UI labels where appropriate
- Maintain all existing API calls and data flow
- Keep all existing business logic intact
