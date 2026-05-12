/**
 * Page-level help content shown to Distributor users via the (i) icon in the page header.
 * Each entry is a Markdown-lite block consumed by <PageHelp />.
 *
 * Keys map to the distributor sidebar / tab keys:
 *   - 'home'             -> /distributor-home
 *   - 'stock-dashboard'  -> Stock Dashboard tab
 *   - 'stockin'          -> Stock In tab
 *   - 'stockout'         -> Stock Out tab
 *   - 'returns'          -> Customer Returns tab
 *   - 'settlements'      -> Settlements tab
 *   - 'billing'          -> Reconciliation tab
 *   - 'profile'          -> My Profile tab
 *   - 'commercial'       -> Commercial tab
 */

export const distributorPageHelp = {
  'home': {
    title: 'Home',
    subtitle: 'Your daily snapshot',
    purpose:
      'Your landing page. Shows the most important numbers at a glance — what just arrived from the factory, what you still need to deliver to customers, pending returns to settle, and your latest settlement status.',
    sections: [
      {
        heading: 'What you see on this page',
        bullets: [
          '**Stock Summary** — current on-hand bottles, pending shipments to acknowledge, and pending factory returns.',
          '**Recent Stock In** — the last few shipments factory sent you. Click any row to open the full shipment.',
          '**Recent Stock Out** — the last few deliveries you made to your customers.',
          '**Quick Actions** — shortcuts to record a delivery or log a customer return.',
        ],
      },
      {
        heading: 'Typical daily routine',
        bullets: [
          '**Morning:** Open Home → check "Pending Stock In Shipments" → go to Stock In and acknowledge anything that arrived.',
          '**Through the day:** Use the "Record Delivery" quick action to log every customer delivery as it happens.',
          '**End of day:** Check Recent Stock Out to confirm everything you delivered today is captured.',
        ],
      },
    ],
  },

  'stock-dashboard': {
    title: 'Stock Dashboard',
    subtitle: 'On-hand inventory by SKU',
    purpose:
      'Shows you exactly how many bottles you currently have, broken down by SKU and bottle type (full, empty/reusable, damaged, expired). This is the single source of truth for your on-hand position.',
    sections: [
      {
        heading: 'How quantities are calculated',
        bullets: [
          '**On-hand = Total received from factory − Total delivered to customers − Total returned to factory.**',
          'Numbers update in real time the moment you acknowledge a Stock In, complete a Stock Out, or confirm a Factory Return.',
        ],
      },
      {
        heading: 'Bottle status breakdown',
        bullets: [
          '**Sellable** — full bottles ready to deliver to customers.',
          '**Customer Returns (pending factory return)** — bottles a customer returned that you have not yet sent back to the factory.',
          '**Factory Returns** — bottles already approved to be returned to factory but not yet shipped.',
        ],
      },
      {
        heading: 'When something looks off',
        bullets: [
          'Counts mismatched? Open the SKU row to see the full ledger of stock-in / stock-out / returns that built up the number.',
          'Still unclear? Contact your Distribution Manager — do not "fix" stock by creating fake entries.',
        ],
      },
    ],
  },

  'stockin': {
    title: 'Stock In (Factory → Distributor)',
    subtitle: 'Receive and acknowledge shipments from the factory',
    purpose:
      'Every bottle that arrives at your warehouse comes through a Stock-In shipment. Your job is to verify the shipment when it arrives and acknowledge what you actually received.',
    sections: [
      {
        heading: 'Shipment status flow',
        bullets: [
          '**Draft** — factory is preparing it (you can ignore these).',
          '**Confirmed** — factory has confirmed the shipment but not yet dispatched (still in factory).',
          '**In Transit** — factory has dispatched. The truck is on its way to you. *This is when you can acknowledge.*',
          '**Delivered** — you have acknowledged it and stock is added to your on-hand.',
          '**Discrepancy Pending** — you reported a shortage; supplier is reviewing.',
        ],
      },
      {
        heading: 'How to acknowledge a shipment',
        bullets: [
          '1. Click any row with status **In Transit**.',
          '2. Review the items list — what was sent and at what price.',
          '3. Click the green **Acknowledge Receipt** button at the bottom.',
          '4. The dialog opens with a row per SKU showing Sent vs Received.',
          '5. **If everything matches** — leave the Received column as-is and click **Confirm Full Receipt**. Stock is added immediately.',
          '6. **If something is short or damaged** — change the Received quantity, add a remark (required), and click **Submit for Supplier Approval**.',
        ],
      },
      {
        heading: 'What happens with a discrepancy',
        bullets: [
          'The shipment status becomes **"Discrepancy — Awaiting Approval"** and the supplier is notified.',
          'They review and either **Approve** (your Received quantity becomes final, stock added at that quantity) or **Reject** (sends it back to you to re-verify).',
          'No stock is added until the discrepancy is resolved.',
        ],
      },
      {
        heading: 'Common mistakes to avoid',
        bullets: [
          'Don\'t acknowledge before the truck has actually arrived and you\'ve physically counted.',
          'Don\'t skip the remark for a discrepancy — the supplier needs it to approve.',
          'If you accidentally acknowledge the wrong quantity, contact your Distribution Manager — only they can reset it.',
        ],
      },
    ],
  },

  'stockout': {
    title: 'Stock Out (Distributor → Customer)',
    subtitle: 'Record deliveries to your customers',
    purpose:
      'Every delivery you make to a customer must be recorded here. This deducts stock from your on-hand, generates the customer invoice value, and feeds the monthly settlement.',
    sections: [
      {
        heading: 'How to record a delivery',
        bullets: [
          '1. Click the green **+ Record Delivery** button (top-right).',
          '2. Pick the **Customer (Account)** from the dropdown.',
          '3. Choose the **From Location** (your warehouse). Date defaults to today.',
          '4. (Optional) Add a reference number and vehicle number.',
          '5. Under **Delivery Items**, pick the SKU and crate size, enter quantity and price/unit, and a discount % if any.',
          '6. Click **+ Add Item** for additional SKUs in the same delivery.',
          '7. Apply any available **Credit Notes** (auto-generated from past customer returns).',
          '8. Add remarks if needed and click **Record Delivery**.',
        ],
      },
      {
        heading: 'Delivery status flow',
        bullets: [
          '**Draft** — recorded but not yet confirmed. You can still edit or delete.',
          '**Confirmed** — finalised. Stock is deducted. Pushes to Zoho Books for invoice generation.',
          '**Delivered** — physically delivered and complete.',
          '**Cancelled** — voided. Stock is restored.',
        ],
      },
      {
        heading: 'Important rules',
        bullets: [
          'Only confirmed deliveries appear in settlements and Zoho invoices. Don\'t leave deliveries in **Draft** at month end.',
          'You can only edit / cancel a **Draft** delivery. Once **Confirmed**, contact your Distribution Manager.',
          'If a customer returns bottles later, log it in **Customer Returns** — *do not* cancel the original delivery.',
          'Credit notes attached to a delivery offset the customer\'s billing — they don\'t reduce your stock.',
        ],
      },
    ],
  },

  'returns': {
    title: 'Customer Returns',
    subtitle: 'Bottles coming back from your customers',
    purpose:
      'When a customer returns bottles (empty, damaged, expired, unsold) you log it here. The system automatically creates a Credit Note that offsets their next bill, and tracks which bottles need to go back to the factory.',
    sections: [
      {
        heading: 'How to record a customer return',
        bullets: [
          '1. Click the **+ New Return** button.',
          '2. Pick the **Customer Account** the bottles came back from.',
          '3. Choose the **Return Date** (when you physically collected them).',
          '4. Pick the **Reason** (Empty / Damaged / Expired / Unsold).',
          '5. Add line items: SKU + quantity + condition.',
          '6. (Optional) Mark "Direct Payment" if you settled the credit in cash on the spot, otherwise the system creates a credit note for the next invoice.',
          '7. Click **Save** to log as Draft.',
        ],
      },
      {
        heading: 'Return lifecycle',
        bullets: [
          '**Draft** — logged but not approved. You can still edit.',
          '**Approved** — credit note auto-generated for the customer.',
          '**Mark Issued** — when you physically pay out / apply the credit (for direct payments).',
          '**Sent to Factory** — when you forward the bottles back to the factory via a Factory Return.',
        ],
      },
      {
        heading: 'When to use which path',
        bullets: [
          '**Empty / Reusable** bottles → log here → eventually send back via Factory Returns.',
          '**Damaged / Expired** bottles → log here → factory will issue a settlement credit.',
          'Bottles never go directly back to factory without first being logged as a customer return.',
        ],
      },
    ],
  },

  'settlements': {
    title: 'Settlements',
    subtitle: 'Monthly net amount you owe / are owed',
    purpose:
      'A settlement is the monthly reconciliation between you and the factory. It nets together everything you owe the factory (transfer price of bottles received) against everything they owe you (margins, returns, damages).',
    sections: [
      {
        heading: 'How the math works',
        bullets: [
          '**Transfer Price Value** — what you owe factory for stock received this period.',
          '**Margin earned** — your share on bottles you delivered to customers.',
          '**Customer Return Credits** — credits passed back to customers, factory refunds you the margin portion.',
          '**Factory Returns** — full transfer price credited for damaged/expired bottles you sent back.',
          '**Net Settlement = Transfer Price − Margins − Return Credits − Factory Returns**.',
        ],
      },
      {
        heading: 'Reading a settlement',
        bullets: [
          '**Draft** — system has generated it, you can review before approving.',
          '**Approved** — both parties accept the math; payment is due.',
          '**Paid** — money has moved; settlement closed.',
        ],
      },
      {
        heading: 'What to do each month',
        bullets: [
          'Open the latest settlement around the 1st of every month.',
          'Cross-check against your own books — do the line totals match what you actually delivered?',
          'If something looks wrong, raise it with the Distribution Manager *before* approving.',
          'Once approved, you cannot edit — only the factory can issue an adjustment.',
        ],
      },
    ],
  },

  'billing': {
    title: 'Reconciliation',
    subtitle: 'Customer reconciliation + settlement view',
    purpose:
      'The corporate-accounting view of your business. Top table shows what each customer owes you (and any credits offsetting that). Bottom table shows the monthly settlement summary with the factory.',
    sections: [
      {
        heading: 'Customer Reconciliation (top table)',
        bullets: [
          '**Billing** — total customer invoice value for the period.',
          '**Return Credit** — credit notes from customer returns offsetting their bills.',
          '**Net Billing** — what the customer actually owes after credits.',
          '**Margin Amt** — your earnings on that customer\'s deliveries.',
          '**Net Billable (after CN)** — final amount due to factory from this customer line.',
        ],
      },
      {
        heading: 'Settlements (bottom table)',
        bullets: [
          'Each row is a finalised monthly settlement.',
          'Click any row to see the line-by-line breakdown.',
          'Use the **Time Period** filter to view a specific month or quarter.',
        ],
      },
      {
        heading: 'Common questions',
        bullets: [
          '**Why is Net Billable different from what I collected?** — Net Billable is the factory\'s expected amount; what you collected from the customer may include extras you keep (e.g., your margin).',
          '**Why is a credit note showing as "applied"?** — it has already been used against a delivery; the offset is locked in.',
        ],
      },
    ],
  },

  'profile': {
    title: 'My Profile',
    subtitle: 'Your distributor master record',
    purpose:
      'Your contact details, registered address, GST info, locations, and the contact people on your team.',
    sections: [
      {
        heading: 'What you can do here',
        bullets: [
          'View your distributor code, legal entity name and current status (Active / Inactive).',
          'See your registered & billing addresses.',
          'See your locations / warehouses (each location has its own stock dashboard).',
          'View other contact people from your team who are mapped to this account.',
        ],
      },
      {
        heading: 'What you cannot do here',
        bullets: [
          'You cannot edit master fields (legal name, GSTIN, addresses, billing approach). Contact your Distribution Manager to change anything.',
          'You can change your own password from the user-menu (top right).',
        ],
      },
    ],
  },

  'commercial': {
    title: 'Commercial',
    subtitle: 'Margin & billing configuration',
    purpose:
      'Your margin percentages by city/SKU and your billing approach (margin-upfront vs cost-based). This determines your earnings on every delivery.',
    sections: [
      {
        heading: 'Margin matrix',
        bullets: [
          'Margins are configured per **City × SKU**.',
          'Margin % shown here is what you keep on every bottle delivered to a customer in that city.',
          'For example: Bottle MRP ₹100, margin 10% → customer pays ₹100, you keep ₹10, you owe factory ₹90.',
        ],
      },
      {
        heading: 'Billing approach',
        bullets: [
          '**Margin Upfront** — factory bills you at the transfer price (post-margin) and you keep your margin immediately on each delivery.',
          '**Cost-Based** — factory bills you at full cost; your margin is reconciled at month-end through settlement.',
        ],
      },
      {
        heading: 'Changing margins',
        bullets: [
          'You cannot change margins yourself — contact your Distribution Manager.',
          'Margin updates apply only to *future* deliveries; past invoices are not retroactively adjusted.',
        ],
      },
    ],
  },
};

/**
 * Look up help content by tab/page key.
 * Returns null if no help is configured for that key (the icon will hide).
 */
export function getDistributorHelp(pageKey) {
  return distributorPageHelp[pageKey] || null;
}
