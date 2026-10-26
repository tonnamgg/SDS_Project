require("dotenv").config();

const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 8083);
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEETS_TAB_NAME || "Deliveries";
const CREDENTIALS_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "/var/secrets/google/credentials.json";

const STATUSES = new Set([
  "PENDING",
  "PROCESSING",
  "SHIPPED",
  "IN_TRANSIT",
  "DELIVERED",
  "CANCELLED"
]);

let sheetsClientPromise;

function now() {
  return new Date().toISOString();
}

// Convert a Google Sheets row into a delivery object.
function rowToDelivery(row) {
  return {
    orderId: row[0] || "",
    status: row[1] || "",
    createdAt: row[2] || "",
    updatedAt: row[3] || "",
    items: parseItems(row[4])
  };
}

// Parse the JSON stored in column E.
function parseItems(value) {
  if (!value) return [];

  try {
    const items = JSON.parse(value);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function getSheetsClient() {
  if (!SPREADSHEET_ID) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not configured");
  }

  if (!sheetsClientPromise) {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    sheetsClientPromise = auth.getClient().then(authClient =>
      google.sheets({
        version: "v4",
        auth: authClient
      })
    );
  }

  return sheetsClientPromise;
}

function range(suffix = "") {
  return `${SHEET_NAME}!A:E${suffix}`;
}

// Read all deliveries from Google Sheets.
async function readAllRows() {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:E`
  });

  const values = response.data.values || [];

  // Row 1 contains the headers.
  return values.slice(1).map((row, index) => ({
    sheetRow: index + 2,
    ...rowToDelivery(row)
  }));
}

// Save a new delivery, including its items.
async function appendDelivery(delivery) {
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:E`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        delivery.orderId,
        delivery.status,
        delivery.createdAt,
        delivery.updatedAt,
        JSON.stringify(delivery.items || [])
      ]]
    }
  });
}

// Update a delivery without losing its items.
async function writeDeliveryRow(sheetRow, delivery) {
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A${sheetRow}:E${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        delivery.orderId,
        delivery.status,
        delivery.createdAt,
        delivery.updatedAt,
        JSON.stringify(delivery.items || [])
      ]]
    }
  });
}

// Define the fields returned by the API.
function publicDelivery(delivery) {
  return {
    orderId: delivery.orderId,
    status: delivery.status,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
    items: delivery.items || []
  };
}

// Health check.
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "delivery-service"
  });
});

// Create a delivery.
app.post("/deliveries", async (req, res) => {
  const orderId = String(req.body?.orderId || "").trim();
  const items = req.body?.items;

  if (!orderId) {
    return res.status(400).json({
      error: "orderId is required"
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: "items must be a non-empty array"
    });
  }

  // Validate and normalize each item.
  const normalizedItems = [];

  for (const [index, item] of items.entries()) {
    const sku = String(item?.sku || "").trim();
    const name = String(item?.name || "").trim();
    const quantity = item?.quantity;

    if (
      !sku ||
      !name ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return res.status(400).json({
        error: `Item at index ${index} must have sku, name, and a positive integer quantity`
      });
    }

    normalizedItems.push({
      sku,
      name,
      quantity
    });
  }

  try {
    const rows = await readAllRows();

    // Prevent duplicate deliveries.
    const existing = rows.find(row => row.orderId === orderId);

    if (existing) {
      return res.status(200).json(publicDelivery(existing));
    }

    const timestamp = now();

    const delivery = {
      orderId,
      status: "PROCESSING",
      createdAt: timestamp,
      updatedAt: timestamp,
      items: normalizedItems
    };

    await appendDelivery(delivery);

    return res.status(201).json(publicDelivery(delivery));
  } catch (error) {
    console.error("Create delivery failed:", error.message);

    return res.status(500).json({
      error: "Could not create delivery. Check service logs and Google Sheets configuration."
    });
  }
});

// Get all deliveries.
app.get("/deliveries", async (_req, res) => {
  try {
    const rows = await readAllRows();

    return res.json(rows.map(publicDelivery));
  } catch (error) {
    console.error("List deliveries failed:", error.message);

    return res.status(500).json({
      error: "Could not read deliveries from Google Sheets."
    });
  }
});

// Get a delivery using its order ID.
app.get("/deliveries/:orderId", async (req, res) => {
  try {
    const rows = await readAllRows();

    const delivery = rows.find(
      row => row.orderId === req.params.orderId
    );

    if (!delivery) {
      return res.status(404).json({
        error: "Delivery not found"
      });
    }

    return res.json(publicDelivery(delivery));
  } catch (error) {
    console.error("Get delivery failed:", error.message);

    return res.status(500).json({
      error: "Could not get delivery."
    });
  }
});

// Update the delivery status.
app.patch("/deliveries/:orderId/status", async (req, res) => {
  const status = String(req.body?.status || "")
    .trim()
    .toUpperCase();

  if (!STATUSES.has(status)) {
    return res.status(400).json({
      error: "Invalid status",
      allowedStatuses: Array.from(STATUSES)
    });
  }

  try {
    const rows = await readAllRows();

    const delivery = rows.find(
      row => row.orderId === req.params.orderId
    );

    if (!delivery) {
      return res.status(404).json({
        error: "Delivery not found"
      });
    }

    delivery.status = status;
    delivery.updatedAt = now();

    await writeDeliveryRow(delivery.sheetRow, delivery);

    return res.json(publicDelivery(delivery));
  } catch (error) {
    console.error("Update delivery failed:", error.message);

    return res.status(500).json({
      error: "Could not update delivery status."
    });
  }
});

// Handle unexpected errors.
app.use((err, _req, res, _next) => {
  console.error("Unhandled request error:", err.message);

  res.status(500).json({
    error: "Internal server error"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Delivery Service listening on port ${PORT}`);
});