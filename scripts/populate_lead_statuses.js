// MongoDB Script to Populate Lead Statuses
// Run this in MongoDB Shell or Compass for your production database
//
// Usage:
// 1. Connect to your production MongoDB
// 2. Run: mongosh "your_connection_string" --file populate_lead_statuses.js
// OR
// 3. Copy and paste this into MongoDB Compass Shell

// Switch to your database (update the name if different)
// use your_database_name;

const leadStatuses = [
  {
    id: "new",
    label: "New",
    color: "blue",
    order: 1,
    is_active: true
  },
  {
    id: "qualified",
    label: "Qualified",
    color: "green",
    order: 2,
    is_active: true
  },
  {
    id: "contacted",
    label: "Contacted",
    color: "yellow",
    order: 3,
    is_active: true
  },
  {
    id: "proposal_internal_review",
    label: "Proposal - Internal Review",
    color: "purple",
    order: 4,
    is_active: true
  },
  {
    id: "ready_to_share_proposal",
    label: "Ready to Share Proposal",
    color: "cyan",
    order: 5,
    is_active: true
  },
  {
    id: "proposal_shared_with_customer",
    label: "Proposal - Shared with Customer",
    color: "orange",
    order: 6,
    is_active: true
  },
  {
    id: "trial_in_progress",
    label: "Trial in Progress",
    color: "indigo",
    order: 7,
    is_active: true
  },
  {
    id: "won",
    label: "Won",
    color: "emerald",
    order: 8,
    is_active: true
  },
  {
    id: "lost",
    label: "Lost",
    color: "red",
    order: 9,
    is_active: true
  },
  {
    id: "not_qualified",
    label: "Not Qualified",
    color: "gray",
    order: 10,
    is_active: true
  }
];

// Clear existing statuses and insert new ones
print("Clearing existing lead_statuses collection...");
db.lead_statuses.deleteMany({});

print("Inserting lead statuses...");
db.lead_statuses.insertMany(leadStatuses);

print("Lead statuses populated successfully!");
print("Total statuses inserted: " + db.lead_statuses.countDocuments({}));

// Verify insertion
print("\nVerifying inserted statuses:");
db.lead_statuses.find({}).sort({order: 1}).forEach(status => {
  print(`  ${status.order}. ${status.label} (${status.id}) - ${status.color}`);
});
