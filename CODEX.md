# GaragemERP Context

## Project Summary

GaragemERP is an ERP-style management system for a semi-new vehicle resale shop in Brazil. The business flow is centered on buying vehicles, preparing them for sale, publishing stock, negotiating with customers, registering sales, tracking commissions, and controlling the financial impact of each operation.

This repository is currently a frontend prototype generated with Lovable and later adjusted manually. It already expresses the main business domains in the UI, but it still works mostly with in-memory mock data instead of a real backend or database.

Because of that, the domain model below should be treated as the intended business structure of the product, not as a 1:1 representation of the current implementation.

## Business Context

The company buys semi-new vehicles from suppliers or trade-ins, performs inspection/preparation work, and resells the vehicles to customers.

The system needs to support:

- vehicle inventory control
- vehicle purchase registration
- vehicle preparation and checklist tracking
- accessory/catalog management
- customer and supplier management
- employee management
- sales registration
- payment, installment, and trade-in scenarios
- commissions for sales staff
- financial transactions, bills, and overdue monitoring
- operational settings, internal users, and company preferences

## Current Product Scope In This Repo

The current UI already contains screens or behavior for:

- login
- dashboard
- vehicles
- clients
- employees
- purchases
- sales
- financial transactions and bills
- settings
- notifications
- vehicle preparation checklist

Important implementation note:

- Supabase Auth login is now wired into the `/login` screen with client-side session handling
- the `_app` layout now redirects unauthenticated users back to `/login`
- logout is available from the sidebar and current session email is shown in the shell
- the vehicles module is wired to Supabase for core CRUD, accessory persistence, publish/unpublish, and checklist persistence, but it still depends on the schema + RLS migrations being applied first
- vehicle history still intentionally waits on the purchases/sales module migration, so the vehicle detail page shows a placeholder there instead of mock-backed records
- an initial relational schema draft now exists under `supabase/migrations/20260523120000_initial_schema.sql`
- a dedicated bootstrap helper now exists to create the first internal `people` + `employees` + `users` records from an existing `auth.users` email after migrations are applied
- Supabase env usage currently expects `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for browser access; server-side fallback also reads `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- a lightweight automated test setup now exists via `npm test`, `npm run test:unit`, and `npm run test:integration`, compiling selected pure TypeScript modules to `.test-dist` and executing them with Node's built-in test runner
- current coverage includes unit tests for formatting helpers, default accessories consistency, checklist summary business rules, vehicle draft normalization, plus an integration-style workflow test for vehicle preparation and margin calculation
- most entities come from `src/lib/mock-data.ts`
- checklist items are now fetched and mutated through Supabase in the checklist module, and the responsible employee picker now reads real `employees` rows instead of mock employee data
- the employees module now reads and mutates real `people` + `employees` rows from Supabase
- the settings "Usuários" tab now provisions real auth accounts through a server-side admin action and can either create a new internal employee bundle or link access to an existing employee; the current user's own access toggle remains protected in the UI
- the clients module now reads and mutates real `people` + `addresses` + `customers` rows from Supabase, and the main client form/detail pages now treat the address as part of the real persisted flow instead of mock data
- shared form inputs now normalize CPF/CNPJ, phone, CEP, UF, plate and numeric entry patterns so the database receives consistent values regardless of how the user types them
- people records are now reused by document when creating customers or employees, so one person can legitimately have more than one role instead of failing on duplicate CPF/CNPJ
- employees and system users are intentionally separate concepts: the employee form keeps the HR record focused, while system access is provisioned separately or linked from the users/settings flow
- the vehicle detail page now treats margin as `sale_price - (cost_price + estimated checklist preparation cost)`, while still showing the realized preparation cost separately
- some features shown in the UI are still synthetic/demo behavior, especially installments, notifications, company settings, and the remaining sales/purchases/financial mock screens

## Current Code Structure

The codebase is now organized to improve maintainability without breaking TanStack file-based route generation.

Current structure:

```text
src/
  app/
    layouts/
    router/
  modules/
    checklist/
      components/
      hooks/
      services/
      index.ts
      types.ts
    customers/
      services/
    dashboard/
      services/
    employees/
      services/
    financial/
      components/
      services/
    purchases/
      types.ts
      services/
    sales/
      types.ts
      services/
    vehicles/
      types.ts
      services/
  routes/
  shared/
    components/
      layout/
      ui/
    hooks/
    lib/
    types/
  styles/
```

Important routing rule:

- `src/routes/` must keep the real `createFileRoute(...)` and `createRootRouteWithContext(...)` definitions
- TanStack regenerates `routeTree.gen.ts` from those real route files
- modularization should happen behind the route layer, not by replacing it with re-export wrappers

## Domain Model Reference

The original UML from `classdiagram.pdf` already covered the core entities:

- `Person`
- `User`
- `Address`
- `Employee`
- `Customer`
- `Vehicle`
- `Accessory`
- `Accessory_Vehicle`
- `Purchase`
- `Sale`
- `Commission`
- `FinancialTransaction`
- `Installment`

Lovable expanded the practical scope with fields and concepts that should also exist in the data model, especially:

- `Vehicle.cost_price`
- `Vehicle.sale_price`
- `Vehicle.image`
- `Customer.created_at`
- vehicle preparation checklist items
- company settings
- system users shown in the settings screen
- notifications
- sale payment details such as method, down payment, and installment breakdown

## Recommended Tables

Below is a consolidated table reference combining the UML and the current frontend behavior.

### `people`

Represents the base identity record used by customers, employees, suppliers, and users.

- `id`
- `name`
- `type` (`individual` or `company`)
- `cpf`
- `cnpj`
- `phone`
- `email`
- `notes`
- `created_at`
- `updated_at`

### `addresses`

Originally present in the UML and still useful for company, customer, supplier, or employee data.

- `id`
- `person_id`
- `street`
- `number`
- `complement`
- `neighborhood`
- `city`
- `state`
- `zip_code`
- `primary`
- `created_at`
- `updated_at`

### `users`

Internal system access. The current settings screen implies this table even though the prototype derives users from employees.

- `id`
- `person_id`
- `employee_id`
- `name`
- `email`
- `password_hash`
- `is_admin`
- `active`
- `email_verified_at`
- `last_login_at`
- `remember_token`
- `created_at`
- `updated_at`

### `employees`

Collaborators of the dealership, especially sales staff and finance/admin staff.

- `id`
- `person_id`
- `position`
- `salary`
- `commission_rate`
- `commission_type` (`percentage` or `fixed`)
- `active`
- `hired_at`
- `notes`
- `created_at`
- `updated_at`

### `customers`

Customer profile attached to a person record.

- `id`
- `person_id`
- `notes`
- `total_purchases`
- `created_at`
- `updated_at`

### `suppliers`

The UML models suppliers as a role of `Person`. For a real database, a dedicated table is helpful when supplier-specific reporting is needed.

- `id`
- `person_id`
- `supplier_type`
- `notes`
- `active`
- `created_at`
- `updated_at`

### `vehicles`

Main stock table for vehicles being bought, prepared, published, and sold.

- `id`
- `plate`
- `brand`
- `model`
- `version`
- `color`
- `fuel_type`
- `transmission`
- `vin`
- `chassis`
- `manufacture_year`
- `model_year`
- `current_mileage`
- `cost_price`
- `sale_price`
- `published`
- `status` (`available`, `reserved`, `sold`, `in_repair`)
- `image`
- `notes`
- `sold_at`
- `created_at`
- `updated_at`

### `accessories`

Accessory catalog configured in settings and associated with vehicles.

- `id`
- `name`
- `description`
- `active`
- `created_at`
- `updated_at`

### `vehicle_accessories`

Join table between vehicles and accessories.

- `id`
- `vehicle_id`
- `accessory_id`
- `created_at`

### `vehicle_checklist_items`

This is one of the main additions introduced by the current frontend. It tracks preparation, repairs, documentation, photography, cleaning, and other steps before a vehicle is truly ready to sell.

- `id`
- `vehicle_id`
- `title`
- `description`
- `category` (`mechanical`, `bodywork`, `cleaning`, `tires`, `oil_change`, `documentation`, `electrical`, `accessories`, `marketplace`, `photography`, `inspection`, `maintenance`, `fueling`, `washing`, `notes`)
- `status` (`pending`, `in_progress`, `waiting_parts`, `completed`, `cancelled`)
- `priority` (`low`, `medium`, `high`, `urgent`)
- `estimated_cost`
- `actual_cost`
- `due_date`
- `completion_date`
- `responsible_employee_id`
- `notes`
- `attachments`
- `created_at`
- `updated_at`

### `purchases`

Represents acquisition of vehicles for stock.

- `id`
- `supplier_id`
- `vehicle_id`
- `employee_id`
- `total_value`
- `purchase_date`
- `status` (`pending`, `completed`, `canceled`)
- `notes`
- `financial_transaction_id`
- `created_at`
- `updated_at`

### `sales`

Represents the commercial sale of a vehicle to a customer.

- `id`
- `customer_id`
- `vehicle_id`
- `employee_id`
- `total_value`
- `discount`
- `status` (`pending`, `completed`, `canceled`)
- `sale_date`
- `notes`
- `trade_in_vehicle_id`
- `trade_in_value`
- `created_at`
- `updated_at`

### `sale_payments`

The current new-sale flow already implies a payment layer separate from the sale record itself.

- `id`
- `sale_id`
- `payment_method` (`cash`, `financing`, `card`, `pix`, `trade_in`)
- `payment_status` (`pending`, `partial`, `paid`)
- `down_payment`
- `installments_count`
- `payment_date`
- `remaining_amount`
- `created_at`
- `updated_at`

### `commissions`

Tracks commission generated by sales and payable to employees.

- `id`
- `sale_id`
- `employee_id`
- `vehicle_id`
- `type` (`percentage` or `fixed`)
- `rate`
- `amount`
- `status` (`pending`, `paid`)
- `due_date`
- `paid_at`
- `notes`
- `created_at`
- `updated_at`

### `financial_transactions`

Central financial ledger for income and expenses.

- `id`
- `type` (`income` or `expense`)
- `category` (`vehicle_sale`, `vehicle_purchase`, `salary`, `commission`, `fixed_cost`, `other`)
- `status` (`pending`, `paid`, `overdue`, `canceled`)
- `amount`
- `transaction_date`
- `due_date`
- `paid_at`
- `description`
- `related`
- `sale_id`
- `purchase_id`
- `employee_id`
- `commission_id`
- `created_at`
- `updated_at`

### `installments`

The UML already had this, and the current UI also points to installment-based sale and finance flows.

- `id`
- `transaction_id`
- `sale_payment_id`
- `number`
- `total_installments`
- `amount`
- `due_date`
- `paid_at`
- `status` (`pending`, `paid`, `overdue`, `canceled`)
- `description`
- `is_installment_parent`
- `created_at`
- `updated_at`

### `company_settings`

The settings page implies a dealership/company record plus configurable defaults.

- `id`
- `legal_name`
- `trade_name`
- `cnpj`
- `state_registration`
- `phone`
- `email`
- `logo_url`
- `zip_code`
- `city`
- `state`
- `street`
- `number`
- `neighborhood`
- `default_commission_type`
- `default_commission_rate`
- `show_estimated_margins`
- `show_overdue_installment_alerts`
- `email_commission_notifications`
- `default_dark_theme_for_new_users`
- `message_of_the_day`
- `created_at`
- `updated_at`

### `notifications`

The header dropdown suggests a notification center for operational alerts.

- `id`
- `type`
- `title`
- `description`
- `related_entity_type`
- `related_entity_id`
- `read_at`
- `created_at`

## Table Approval Review

Approved for V1:

- `people`
- `addresses`
- `users`
- `employees`
- `customers`
- `suppliers`
- `vehicles`
- `accessories`
- `vehicle_accessories`
- `vehicle_checklist_items`
- `purchases`
- `sales`
- `sale_payments`
- `commissions`
- `financial_transactions`
- `company_settings`

Review before implementation:

- `notifications`
  Reason: the UI implies notifications, but the event model is not yet mature enough to justify schema lock-in

Recommended V1 migration scope:

1. `people`
2. `addresses`
3. `users`
4. `employees`
5. `customers`
6. `suppliers`
7. `vehicles`
8. `accessories`
9. `vehicle_accessories`
10. `vehicle_checklist_items`
11. `sales`
12. `sale_payments`
13. `commissions`
14. `purchases`
15. `financial_transactions`
16. `installments`
17. `company_settings`

Suggested V1.1 or later:

- `notifications`

Notes for Supabase planning:

- `users` should likely be linked to `auth.users` if Supabase Auth is used
- `vehicles.plate`, `vehicles.vin`, and `vehicles.chassis` should probably be unique
- `vehicle_accessories` should have a unique constraint on (`vehicle_id`, `accessory_id`)
- `customers.total_purchases` can be denormalized or calculated later from completed sales
- `vehicle_checklist_items.attachments` can start as JSON and be normalized later if uploads become a first-class feature
- `financial_transactions` should be treated as the financial ledger table
- `sale_payments` is worth keeping separate because the current product already implies partial payments, financing, and trade-in scenarios
- `installments` in the current draft can point to `sale_payments`, `financial_transactions`, or both; that is intentionally flexible until the service layer is implemented

## Relationship Summary

- one `person` can be linked to one `customer`
- one `person` can be linked to one `employee`
- one `person` can be linked to one `user`
- one `person` can have many `addresses`
- one `vehicle` can have many `vehicle_checklist_items`
- one `vehicle` can have many `vehicle_accessories`
- one `vehicle` can belong to one purchase flow and later one sale flow
- one `sale` belongs to one customer, one vehicle, and one employee
- one `sale` can generate one or many `sale_payments`
- one `sale` can generate one `commission`
- one `financial_transaction` can be standalone or linked to purchase, sale, commission, salary, or installment logic

## Current Frontend Types Vs. Future Database

Today the frontend uses nested objects like:

- `Sale -> customer: Customer`
- `Sale -> vehicle: Vehicle`
- `Sale -> employee: Employee`
- `Purchase -> supplier: Person`

In a real backend, these should become foreign keys and relations instead of embedded objects in the persisted model.

## Practical Guidance For Future Work

When working in this repository, assume:

- this is a dealership ERP for Brazilian semi-new vehicle resale
- the current app is a frontend prototype, not the final architecture
- checklist preparation is a real first-class feature, not just UI decoration
- settings/users/accessories/notifications exist in the product scope even if not fully persisted yet
- sales, purchases, commissions, and finance should stay consistent with each other
- vehicle profitability depends on `cost_price + preparation costs` versus `sale_price`
- addresses now exist in the shared frontend model as an optional `Person.primary_address`; keep richer address relations in the database layer, but use the single primary address shape for person-facing forms until the UI needs multiple addresses

## Suggested File Structure

The implemented direction is domain-first plus shared layers, while keeping TanStack-compatible route files.

Implemented structure:

```text
src/
  app/
    layouts/
    router/
  modules/
    checklist/
      components/
      hooks/
      services/
      index.ts
      types.ts
    customers/
      services/
    dashboard/
      services/
    employees/
      services/
    financial/
      components/
      services/
    purchases/
      services/
    sales/
      services/
    vehicles/
      services/
  routes/
  shared/
    components/
      layout/
      ui/
    hooks/
    lib/
    types/
  styles/
```

Layer intent:

- `app/`: application bootstrap, router wrapper, and app-level layout
- `modules/`: business features grouped by domain
- `shared/`: reusable UI, hooks, helper functions, and generic types
- `routes/`: real TanStack route files that the generator must be able to scan
- `styles/`: global style entrypoints

Rules to follow:

- keep real route declarations in `src/routes/`
- move reusable primitives to `shared/components/ui/`
- move global shell pieces to `shared/components/layout/`
- move domain-specific state, mock data, and adapters to `modules/*/services/`
- keep form draft types close to their domain modules in `modules/*/types.ts` when they represent multi-step or pre-persistence UI state
- keep compatibility glue in `src/lib/` only when removing it immediately would cause broad churn
- prefer new imports from `shared/` and `modules/` instead of growing `src/lib/`
- use the module `services/` layer as the seam for replacing mocks with Supabase access later

## Source Of Truth Used For This Summary

This context was consolidated from:

- `classdiagram.pdf`
- `src/lib/mock-data.ts`
- `src/shared/types/domain.ts`
- `src/modules/checklist/index.ts`
- `src/modules/checklist/services/checklist-store.ts`
- current routes for vehicles, sales, purchases, financial, login, and settings
- the currently implemented modular structure under `src/app`, `src/modules`, `src/shared`, and `src/styles`
- `supabase/migrations/20260523120000_initial_schema.sql`
