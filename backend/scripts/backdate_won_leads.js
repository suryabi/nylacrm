// MongoDB Shell Script to Backdate WON Leads to February 2026
// 
// Run this in MongoDB shell or Compass
// 
// Usage:
//   mongosh "mongodb://..." --eval "load('backdate_won_leads.js')"
//
// Or copy-paste into MongoDB Compass shell

// Configuration
const targetDate = new Date("2026-02-15T12:00:00.000Z");
const targetDateISO = targetDate.toISOString();

print("=" .repeat(60));
print("BACKDATE WON LEADS TO FEBRUARY 2026");
print("=" .repeat(60));
print(`Target Date: ${targetDateISO}`);
print("");

// Find leads that are WON or converted to accounts
const query = {
    $or: [
        { status: "won" },
        { converted_to_account: true }
    ]
};

// Preview
const leadsToUpdate = db.leads.find(query, {
    _id: 0,
    id: 1,
    lead_id: 1,
    company: 1,
    status: 1,
    converted_to_account: 1,
    estimated_value: 1,
    updated_at: 1
}).toArray();

print(`Found ${leadsToUpdate.length} leads to update:\n`);

let totalValue = 0;
leadsToUpdate.forEach((lead, i) => {
    const value = lead.estimated_value || 0;
    totalValue += value;
    print(`${i + 1}. ${lead.lead_id || 'N/A'} - ${lead.company || 'Unknown'}`);
    print(`   Status: ${lead.status}, Converted: ${lead.converted_to_account || false}`);
    print(`   Estimated Value: ₹${value.toLocaleString('en-IN')}`);
    print(`   Current updated_at: ${lead.updated_at}`);
    print("");
});

print("=" .repeat(60));
print(`Total Leads: ${leadsToUpdate.length}`);
print(`Total Estimated Value: ₹${totalValue.toLocaleString('en-IN')}`);
print("=" .repeat(60));

// Uncomment the line below to actually perform the update
// db.leads.updateMany(query, { $set: { updated_at: targetDateISO } });

print("\n⚠️  UPDATE NOT EXECUTED - Preview only");
print("To execute, uncomment the updateMany line and run again.");
