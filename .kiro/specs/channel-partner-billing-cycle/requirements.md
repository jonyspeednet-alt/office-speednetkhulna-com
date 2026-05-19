# Requirements Document

## Introduction

This feature enhances the Channel Partner (ISP reseller) billing management system to accurately track the full lifecycle of a monthly billing cycle. The current system conflates when a payment was made with which month it covers, has no mechanism for declaring self-collected amounts, and uses a single-number adjustment model that is not granular enough for audit purposes.

The enhanced system introduces:
- **Payment period tracking** — separating `billing_month` (which month a payment covers) from `payment_date` (when cash was received), enabling late-payment identification.
- **Self-collection declaration** — a formal mechanism for the admin to declare amounts the channel partner collected outside the system.
- **Configurable commission basis** — three calculation modes (system-recorded only, total due, or declared collection).
- **Month-end reconciliation** — a structured step before commission finalization that surfaces discrepancies.
- **Granular audit trail** — every change to a commission log is recorded with actor, timestamp, and reason.

---

## Glossary

- **System**: The channel partner billing management system being specified.
- **Admin**: The ISP staff member who operates the system on behalf of the ISP.
- **Channel_Partner**: An ISP reseller (also called "client") who collects monthly bills from end-users and receives a profit-share commission from the ISP.
- **End_User**: An internet subscriber managed under a Channel_Partner.
- **Billing_Month**: The calendar month (YYYY-MM) that a payment record covers — i.e., the month the service was rendered.
- **Payment_Date**: The actual calendar date on which cash or a transfer was received.
- **Late_Payment**: A payment whose `Payment_Date` falls in a month later than its `Billing_Month`.
- **Carry_Forward_Due**: The unpaid balance from a previous Billing_Month that is added to the current month's `amount_due` for an End_User.
- **Self_Collection**: An amount the Channel_Partner collected from End_Users directly (outside the system) and spent before reporting it to the ISP.
- **Declared_Collection**: The sum of system-recorded collections and any Self_Collection amounts declared by the Admin for a given Billing_Month.
- **Commission_Basis**: The monetary amount on which the profit-share percentage is applied to compute gross commission. One of: `system_recorded`, `total_due`, or `declared_collection`.
- **Commission_Log**: The per-month record in `channel_commission_logs` that stores all commission calculation fields for a Channel_Partner.
- **Reconciliation**: The month-end review step where the Admin confirms Late_Payments, Self_Collection declarations, and the Commission_Basis before finalizing the Commission_Log.
- **Profit_Share_Pct**: The percentage rate stored on the reseller record, applied to the Commission_Basis to compute gross commission.
- **Closing_Balance**: The amount still owed to the Channel_Partner after subtracting payments made to them: `net_commission + previous_balance − paid_to_partner`.
- **Audit_Log**: An immutable record of every state-changing action on a Commission_Log, including actor identity, timestamp, previous value, new value, and reason.
- **Payment_Period_Record**: The enhanced `channel_user_payments` row that carries both `billing_month` and `payment_date` as separate fields.
- **Self_Collection_Declaration**: A record in the new `channel_self_collections` table declaring that the Channel_Partner collected a specific amount from a specific End_User for a specific Billing_Month outside the system.

---

## Requirements

---

### Requirement 1: Payment Period Tracking

**User Story:** As an Admin, I want each user payment record to separately store which month the payment covers and when the cash was actually received, so that late payments are unambiguously identified and commission calculations are accurate.

#### Acceptance Criteria

1. THE System SHALL store a `billing_month` (YYYY-MM) field and a `payment_date` (DATE) field as separate, independent columns on every Payment_Period_Record.
2. WHEN the Admin records a payment for an End_User, THE System SHALL require `billing_month` and SHALL default `payment_date` to the current date in the Asia/Dhaka timezone if not explicitly provided.
3. WHEN a Payment_Period_Record is saved where `payment_date` falls in a calendar month later than `billing_month`, THE System SHALL mark that record with `is_late_payment = TRUE`.
4. THE System SHALL allow a single End_User to have multiple Payment_Period_Records for different `billing_month` values within the same calendar month (e.g., paying month A and month B arrears in the same month).
5. WHEN the Admin queries user payments for a given `billing_month`, THE System SHALL return all Payment_Period_Records whose `billing_month` matches the query parameter, regardless of `payment_date`.
6. IF a Payment_Period_Record is submitted with a `billing_month` that is more than 12 months in the past relative to the current Dhaka-timezone month, THEN THE System SHALL return a validation error with a descriptive message.

---

### Requirement 2: Carry-Forward Due Calculation

**User Story:** As an Admin, I want the system to automatically compute each End_User's total amount due for a new month by adding their unpaid balance from the previous month, so that outstanding dues are never silently dropped.

#### Acceptance Criteria

1. WHEN the Admin initializes monthly payments for Billing_Month M, THE System SHALL compute each active End_User's `amount_due` as: `monthly_rate + MAX(0, amount_due_M-1 − amount_paid_M-1)`.
2. WHEN an End_User has no Payment_Period_Record for the previous Billing_Month, THE System SHALL treat their previous unpaid balance as zero.
3. THE System SHALL expose the `carry_forward_amount` component separately in the payment initialization response, so the Admin can see how much of the `amount_due` is arrears versus current month's rate.
4. WHEN the Admin re-initializes payments for a Billing_Month that already has records, THE System SHALL recalculate and update `amount_due` for each End_User without resetting `amount_paid` or `payment_date` values that have already been recorded.
5. IF an End_User's `monthly_rate` is zero and their previous unpaid balance is also zero, THEN THE System SHALL still create a Payment_Period_Record for that End_User with `amount_due = 0` and `payment_status = 'unpaid'`.

---

### Requirement 3: Self-Collection Declaration

**User Story:** As an Admin, I want to formally declare amounts that the Channel_Partner collected from End_Users outside the system, so that those amounts are included in the commission calculation and the Channel_Partner's declared collection is fully auditable.

#### Acceptance Criteria

1. THE System SHALL provide an API endpoint that allows the Admin to create a Self_Collection_Declaration record containing: `reseller_id`, `billing_month`, `user_id` (optional), `declared_amount`, `collection_date`, and `note`.
2. WHEN a Self_Collection_Declaration is created for a `billing_month` whose Commission_Log has `status = 'finalized'`, THE System SHALL reject the request and return an error stating that the month is already finalized.
3. THE System SHALL allow multiple Self_Collection_Declaration records per Channel_Partner per Billing_Month (one per End_User or one aggregate entry).
4. WHEN the Admin queries the commission summary for a Billing_Month, THE System SHALL include `total_self_declared` as the sum of all Self_Collection_Declaration `declared_amount` values for that month.
5. THE System SHALL allow the Admin to delete a Self_Collection_Declaration only if the associated Billing_Month Commission_Log has `status != 'finalized'`.
6. WHEN a Self_Collection_Declaration is created or deleted, THE System SHALL write an Audit_Log entry recording the actor, timestamp, action type, and the `declared_amount` affected.

---

### Requirement 4: Commission Basis Configuration

**User Story:** As an Admin, I want to choose the basis on which commission is calculated for each month, so that the ISP can apply the correct calculation method depending on the trust level and agreement with each Channel_Partner.

#### Acceptance Criteria

1. THE System SHALL support three Commission_Basis modes for commission generation:
   - `system_recorded`: gross commission = `SUM(amount_paid)` for the Billing_Month × Profit_Share_Pct
   - `total_due`: gross commission = `SUM(amount_due)` for the Billing_Month × Profit_Share_Pct
   - `declared_collection`: gross commission = (`SUM(amount_paid)` + `total_self_declared`) × Profit_Share_Pct
2. WHEN the Admin generates or regenerates a commission for a Billing_Month, THE System SHALL require the Admin to specify the `commission_basis` mode.
3. THE System SHALL store the chosen `commission_basis` value on the Commission_Log so it is permanently recorded alongside the calculated figures.
4. WHEN `commission_basis = 'declared_collection'` is selected and `total_self_declared = 0`, THE System SHALL proceed with the calculation using only `SUM(amount_paid)` and SHALL NOT block the operation.
5. WHEN `commission_basis = 'total_due'` is selected, THE System SHALL use `SUM(amount_due)` from Payment_Period_Records for the Billing_Month, including Carry_Forward_Due amounts.
6. THE System SHALL display the `commission_basis` label and the effective collection amount used in all commission summary responses.

---

### Requirement 5: Month-End Reconciliation

**User Story:** As an Admin, I want a structured reconciliation step before finalizing a month's commission, so that Late_Payments, Self_Collection declarations, and the Commission_Basis are all confirmed before the figures are locked.

#### Acceptance Criteria

1. THE System SHALL provide a reconciliation summary endpoint for a given `reseller_id` and `billing_month` that returns:
   - List of Late_Payment records (Payment_Period_Records where `is_late_payment = TRUE` and `billing_month` = the queried month)
   - List of Self_Collection_Declaration records for the month
   - `total_system_collected`: SUM of `amount_paid` for the Billing_Month
   - `total_self_declared`: SUM of Self_Collection_Declaration `declared_amount` for the month
   - `total_declared_collection`: `total_system_collected + total_self_declared`
   - `total_due`: SUM of `amount_due` for the Billing_Month
   - `unpaid_user_count`: count of End_Users with `amount_paid = 0` for the Billing_Month
   - Current `commission_basis` if a Commission_Log already exists for the month
2. WHEN the Admin submits a reconciliation confirmation, THE System SHALL record a `reconciled_at` timestamp and `reconciled_by` actor on the Commission_Log.
3. WHILE a Commission_Log has `status = 'finalized'`, THE System SHALL reject any new reconciliation confirmation for that month and return an error.
4. THE System SHALL allow the Admin to perform reconciliation multiple times before finalization; each confirmation SHALL overwrite the previous `reconciled_at` and `reconciled_by` values.
5. WHEN the Admin attempts to finalize a Commission_Log that has never been reconciled, THE System SHALL return a warning response indicating that reconciliation has not been performed, but SHALL still allow finalization to proceed if the Admin explicitly confirms.

---

### Requirement 6: Commission Calculation Integrity

**User Story:** As an Admin, I want the commission calculation to enforce mathematical invariants at all times, so that the ISP never pays incorrect commission amounts and the figures are always auditable.

#### Acceptance Criteria

1. THE System SHALL ensure that `net_commission = gross_commission + adjustments − deductions` at all times when a Commission_Log is saved or updated.
2. THE System SHALL ensure that `closing_balance = net_commission + previous_balance − paid_to_partner` at all times when a Commission_Log is saved or updated.
3. IF a computed `net_commission` would be negative due to deductions exceeding gross commission plus adjustments, THEN THE System SHALL cap `net_commission` at zero and record the excess deduction in a `deduction_overflow` field on the Commission_Log.
4. WHEN the Admin records a commission payment to the Channel_Partner, THE System SHALL recalculate and update `paid_to_partner`, `closing_balance`, and `payment_status` on the associated Commission_Log atomically within a single database transaction.
5. WHEN a Commission_Log has `status = 'finalized'`, THE System SHALL reject any direct modification to `gross_commission`, `adjustments`, `deductions`, `net_commission`, `previous_balance`, or `total_payable` fields and return an error.
6. THE System SHALL derive `previous_balance` for Billing_Month M from the `closing_balance` of the most recently finalized Commission_Log for the same Channel_Partner with `month < M`.

---

### Requirement 7: Granular Adjustment Entries

**User Story:** As an Admin, I want to add multiple named adjustment and deduction entries to a commission rather than a single aggregate number, so that each adjustment is individually traceable and the commission history is fully auditable.

#### Acceptance Criteria

1. THE System SHALL support multiple adjustment entries per Commission_Log, each stored as a separate record with: `commission_log_id`, `entry_type` (`adjustment` or `deduction`), `amount`, `note`, `created_by`, and `created_at`.
2. WHEN an adjustment entry is created or deleted, THE System SHALL recalculate the Commission_Log's `adjustments` total (sum of all `adjustment` entries) and `deductions` total (sum of all `deduction` entries) and update `net_commission`, `total_payable`, and `closing_balance` accordingly.
3. WHEN a Commission_Log has `status = 'finalized'`, THE System SHALL reject creation or deletion of adjustment entries for that log and return an error.
4. THE System SHALL return all adjustment entries for a Commission_Log when the commission summary is requested, ordered by `created_at` ascending.
5. IF an adjustment entry `amount` is zero or negative, THEN THE System SHALL reject the entry and return a validation error.

---

### Requirement 8: Audit Trail

**User Story:** As an Admin, I want every state-changing action on a commission record to be permanently logged with actor identity and reason, so that the ISP can reconstruct the full history of any commission calculation.

#### Acceptance Criteria

1. THE System SHALL write an Audit_Log entry for each of the following actions: commission generated, commission regenerated, adjustment entry added, adjustment entry deleted, Self_Collection_Declaration created, Self_Collection_Declaration deleted, reconciliation confirmed, commission finalized, commission payment recorded.
2. EACH Audit_Log entry SHALL contain: `reseller_id`, `commission_log_id` (nullable for self-collection actions), `action_type`, `actor_id`, `actor_name`, `ip_address`, `previous_value` (JSON), `new_value` (JSON), `note`, and `created_at`.
3. THE System SHALL store Audit_Log entries in an append-only table; THE System SHALL NOT provide any API endpoint that deletes or modifies Audit_Log entries.
4. WHEN the Admin requests the audit history for a Commission_Log, THE System SHALL return all Audit_Log entries for that `commission_log_id` ordered by `created_at` ascending.
5. THE System SHALL retain Audit_Log entries indefinitely and SHALL NOT apply any automatic expiry or purge policy.

---

### Requirement 9: Late Payment Reporting

**User Story:** As an Admin, I want to view a report of all late payments received in a given month, so that I can understand how much of the current month's collection is actually for previous months' bills.

#### Acceptance Criteria

1. THE System SHALL provide a late-payment report endpoint that accepts `reseller_id` and `payment_month` (the month in which cash was received) and returns all Payment_Period_Records where `is_late_payment = TRUE` and `payment_date` falls within `payment_month`.
2. EACH record in the late-payment report SHALL include: `user_id`, `user_name`, `billing_month`, `payment_date`, `amount_paid`, and `carry_forward_amount` at the time of the original billing.
3. THE System SHALL include a summary in the late-payment report response containing: `total_late_amount` (sum of `amount_paid` for all late records in the result), `late_payment_count`, and `affected_user_count`.
4. WHEN no late payments exist for the queried `payment_month`, THE System SHALL return an empty list with summary values of zero rather than an error.

---

### Requirement 10: Data Integrity on Finalization

**User Story:** As an Admin, I want finalized commission records to be immutable, so that historical commission figures cannot be accidentally or maliciously altered after the Channel_Partner has been paid.

#### Acceptance Criteria

1. WHEN a Commission_Log transitions to `status = 'finalized'`, THE System SHALL record `finalized_at` (timestamp), `finalized_by` (actor ID), and `finalized_by_name` (actor display name) on the Commission_Log.
2. WHILE a Commission_Log has `status = 'finalized'`, THE System SHALL reject any API request that attempts to change `gross_commission`, `net_commission`, `adjustments`, `deductions`, `previous_balance`, `total_payable`, `commission_basis`, or `status` and SHALL return HTTP 409 with a descriptive error message.
3. THE System SHALL allow commission payments (`channel_commission_payments` records) to be added to a finalized Commission_Log, and SHALL update `paid_to_partner`, `closing_balance`, and `payment_status` accordingly, as these represent cash flow events that occur after finalization.
4. IF the Admin attempts to re-generate commission for a Billing_Month whose Commission_Log is already finalized, THEN THE System SHALL reject the request and return an error stating the month is locked.
5. THE System SHALL allow a new Commission_Log to be created for a future Billing_Month even when the previous month's Commission_Log is not yet finalized, using the most recent finalized `closing_balance` as `previous_balance`.

---

### Requirement 11: Commission Summary API

**User Story:** As an Admin, I want a single API endpoint that returns the complete commission picture for a given month, so that the UI can display all relevant figures without multiple round trips.

#### Acceptance Criteria

1. WHEN the Admin requests the commission summary for a `reseller_id` and `billing_month`, THE System SHALL return a single response containing: `month`, `profit_share_percentage`, `commission_basis`, `total_users`, `active_users`, `paying_users`, `non_paying_users`, `total_due`, `total_system_collected`, `total_self_declared`, `total_declared_collection`, `gross_commission`, `adjustments` (list), `deductions` (list), `net_commission`, `previous_balance`, `total_payable`, `paid_to_partner`, `closing_balance`, `commission_status`, `payment_status`, `reconciled_at`, `finalized_at`.
2. WHEN no Commission_Log exists for the queried month, THE System SHALL return a summary with `commission_status = 'not_generated'` and SHALL compute `gross_commission` as a preview based on the current `commission_basis` default (`system_recorded`) without persisting any record.
3. THE System SHALL compute all monetary fields to exactly two decimal places using banker's rounding (round half to even).
4. WHEN the queried `billing_month` is in the future relative to the current Dhaka-timezone month, THE System SHALL return the summary with a `is_future_month = true` flag and SHALL NOT allow commission generation for that month.
