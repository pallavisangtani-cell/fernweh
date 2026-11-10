export const KEY = "travel-journal-v1";
export const LISTS = ["itin", "trans", "stays", "places", "budget", "packing"];
export const KS = ["itin", "trans", "stays", "places", "budget"];
export const PCATS = ["Food & drink", "Hotel", "Vineyard", "Sights", "Activity", "Shopping", "Other"];
export const CATS = [["itin", "Activities"], ["trans", "Transport"], ["stays", "Stays"], ["budget", "Other costs"]];
export const BOOKABLE = ["itin", "trans", "stays"];
export const CURS = ["AED", "USD", "EUR", "GBP", "JPY", "CHF", "SGD"];
export const STARTER = ["Passport", "Phone charger", "Power adapter", "Medication", "Toiletries", "Comfortable shoes", "Travel insurance details", "Reusable water bottle"];
export const SAMPLES = [
  ["Flight", "Emirates EK055 DXB to DUS on 1 Dec, booked, ref HG8P22, 1800 AED. Landing in Düsseldorf, coffee and a look at the Rhine Tower."],
  ["Hotel", "Hotel Aloft Frankfurt via Booking.com, 2 to 6 Dec, tentative, 540 EUR, not paid yet."],
  ["Bank SMS", "Purchase of EUR 45.50 at Starbucks Düsseldorf Hbf"],
  ["Past trip", "Lisbon, Portugal, March 2024. Flew Emirates EK191 DXB to LIS, 2,400 AED. Stayed at Hotel Avenida 12 to 16 March, 540 EUR. Lunch at Time Out Market, pastéis at Manteigaria, day trip to Sintra."]
];
export const XLSX_SRC = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
export const MAMMOTH_SRC = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";

const STAT = [
  { k: "status", ph: "Status", type: "select", w: 120, opts: [["tentative", "Tentative"], ["confirmed", "Confirmed"]] },
  { k: "booked", ph: "Booking", type: "select", w: 120, opts: [["no", "Not booked"], ["yes", "Booked"]] }
];
const MONEY = [{ k: "cost", ph: "Planned cost", type: "number", w: 110 }, { k: "spent", ph: "Spent so far", type: "number", w: 110 }];
const opts = (xs) => xs.map((x) => [x, x]);

export const TABS = {
  over: { label: "Overview" },
  itin: { label: "Itinerary", req: "text", add: "Add activity", fields: [{ k: "day", ph: "Day", type: "number", w: 70 }, { k: "time", ph: "Time", type: "time", w: 110 }, { k: "text", ph: "Activity", grow: 1 }, { k: "via", ph: "Provider or venue", w: 160 }].concat(MONEY, STAT) },
  trans: { label: "Flights & transport", req: "route", add: "Add transport", fields: [{ k: "mode", ph: "Mode", type: "select", w: 100, opts: opts(["Flight", "Train", "Bus", "Ferry", "Car", "Taxi", "Other"]) }, { k: "no", ph: "Flight / train no.", w: 130 }, { k: "route", ph: "Route (e.g. DXB to LIS)", grow: 1 }, { k: "via", ph: "Carrier (e.g. Emirates)", w: 170 }, { k: "date", ph: "Date", type: "date" }, { k: "time", ph: "Time", type: "time", w: 110 }, { k: "ref", ph: "Booking ref", w: 120 }].concat(MONEY, STAT) },
  stays: { label: "Stays", req: "name", add: "Add stay", fields: [{ k: "name", ph: "Hotel", grow: 1 }, { k: "via", ph: "Booked via", w: 160 }, { k: "checkin", ph: "Check-in", type: "date" }, { k: "checkout", ph: "Check-out", type: "date" }, { k: "conf", ph: "Confirmation no.", w: 140 }].concat(MONEY, STAT) },
  places: { label: "Places", req: "name", add: "Add place", fields: [{ k: "name", ph: "Place name", grow: 1 }, { k: "cat", ph: "Category", type: "select", w: 140, opts: opts(PCATS) }, { k: "note", ph: "Note", grow: 1 }, { k: "link", ph: "Google Maps link (optional)", grow: 1 }] },
  budget: { label: "Other costs", req: "label", add: "Add cost", fields: [{ k: "label", ph: "Item", grow: 1 }, { k: "cat", ph: "Category", w: 130 }, { k: "cost", ph: "Planned", type: "number", w: 110 }, { k: "spent", ph: "Spent", type: "number", w: 110 }] },
  packing: { label: "Packing", req: "text", add: "Add item", fields: [{ k: "text", ph: "Item to pack", grow: 1 }] },
  notes: { label: "Notes" }
};
