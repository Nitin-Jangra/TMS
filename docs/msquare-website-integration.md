# MSquare Professionals — Website API & Complaint Integration Guide

This guide details how to integrate the **Complaint Workflow** into the main **MSquare Professionals** website ([msquareprofessionals.com](https://msquareprofessionals.com/)) using the REST API or drop-in UI components.

---

## Live Cloudflare API Base URL
- **Production Base URL:** `https://tms.nitinjangra0981.workers.dev`
- **CORS Enabled:** Full cross-origin support enabled for `https://msquareprofessionals.com` and all subdomains.

---

## Method 1: Turnkey Drop-in JavaScript Widget (Recommended)

The fastest and cleanest method to add the complaint button to `msquareprofessionals.com` without building custom forms or modals.

### Step 1: Add the script to your website's HTML / `<head>` or `<footer>`:
```html
<script src="https://tms.nitinjangra0981.workers.dev/msquare-complaint-widget.js" async></script>
```

### Step 2: Add the "Complaint" Button anywhere on your website (e.g. Navbar or Header):
```html
<!-- In your header / navbar -->
<button 
  type="button" 
  data-msquare-complaint
  style="display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #ff6b00 0%, #ff8533 100%); color: #ffffff; padding: 10px 20px; border-radius: 10px; font-weight: 700; font-size: 14px; border: none; cursor: pointer; box-shadow: 0 4px 14px rgba(255, 107, 0, 0.4);"
>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
  Complaint
</button>

<!-- Optional: Track Ticket link -->
<a 
  href="#" 
  data-msquare-track 
  style="color: #ff6b00; font-size: 13px; font-weight: 600; text-decoration: none; margin-left: 14px;"
>
  Track Ticket →
</a>
```

### What Happens Automatically:
1. Clicking **Complaint** opens an obsidian `#13131a` modal styled to match `msquareprofessionals.com`.
2. It queries active branches and complaint categories dynamically.
3. Submitting the form:
   - Registers the ticket in the Cloudflare D1 database.
   - Generates the official ticket ID (e.g. `MSP-2026-000124`).
   - Automatically dispatches an alert email to `nitin98175@gmail.com`.
   - Sends a confirmation greeting email from `nitin98175@gmail.com` to the client.
4. Clients can track progress anytime directly inside the modal using the "Track Ticket" tab.
5. *(Note: If you omit `data-msquare-complaint`, the script renders a floating orange `[ 💬 Complaint ]` button at the bottom-right of the screen).*

---

## Method 2: Custom Frontend API Integration (Fetch / React / Vue / Vanilla JS)

If you have a custom contact form or modal on the MSquare website and want to send the complaint data directly via the REST API.

### 1. Fetch Active Branches and Categories
Before rendering dropdowns, fetch active branches and categories:

```javascript
// 1. Get Branches
const branchesRes = await fetch("https://tms.nitinjangra0981.workers.dev/api/v1/public/branches");
const { data: { branches } } = await branchesRes.json();
// Returns: [{ id: "b001", code: "B001", name: "Sector 48", city: "Gurugram" }, ...]

// 2. Get Complaint Categories
const categoriesRes = await fetch("https://tms.nitinjangra0981.workers.dev/api/v1/public/categories");
const { data: { categories } } = await categoriesRes.json();
// Returns: [{ id: "cat_01", name: "Equipment & Facilities" }, ...]
```

### 2. Submit Complaint
Send a `POST` request to `/api/v1/public/complaints`:

```javascript
async function submitComplaint(formData) {
  const response = await fetch("https://tms.nitinjangra0981.workers.dev/api/v1/public/complaints", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `msp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    },
    body: JSON.stringify({
      customerName: formData.name,       // Full Name (min 2 chars)
      customerPhone: formData.phone,     // 10-12 digit mobile number
      customerEmail: formData.email,     // Client email for status alerts
      branchId: formData.branchId,       // e.g. "b001"
      categoryId: formData.categoryId,   // e.g. "cat_01"
      description: formData.description, // Details (min 10 chars)
      privacyConsent: true               // Mandatory boolean
    })
  });

  const result = await response.json();
  if (result.success) {
    console.log("Ticket Created:", result.data.ticketNumber); // e.g. "MSP-2026-000124"
    alert(`Complaint submitted! Your ticket number is: ${result.data.ticketNumber}`);
  } else {
    console.error("Submission failed:", result.error.message);
  }
}
```

### 3. Track Ticket Status
Allow clients to check their live SLA status and assigned support manager:

```javascript
async function trackTicket(ticketNumber, mobileNumber) {
  const response = await fetch("https://tms.nitinjangra0981.workers.dev/api/v1/public/tickets/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticketNumber: ticketNumber.trim(), // e.g. "MSP-2026-000124"
      mobileNumber: mobileNumber.trim()  // Registered mobile
    })
  });

  const result = await response.json();
  if (result.success) {
    const ticket = result.data.ticket;
    console.log("Status:", ticket.statusLabel); // "In Progress", "Resolved", etc.
    console.log("Timeline:", ticket.timeline);
    console.log("Assigned To:", ticket.assigneeFirstName);
  }
}
```

---

## Method 3: Backend Server-to-Server Integration (Integration API with API Key)

Use this when complaints are collected on your server (Node.js, Next.js API route, Python/Django, PHP, or CRM).

### Endpoint: `POST /api/v1/integration/complaints`
- **Header:** `x-api-key: <YOUR_API_KEY>`
- **Header:** `Content-Type: application/json`

*(API keys are created in the Root Admin panel at `/admin/api-keys`).*

### Example (Node.js / Express / Next.js Server):
```javascript
const response = await fetch("https://tms.nitinjangra0981.workers.dev/api/v1/integration/complaints", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.MSQUARE_TMS_API_KEY,
    "Idempotency-Key": `crm-lead-${leadId}`
  },
  body: JSON.stringify({
    customerName: "Rahul Khanna",
    customerPhone: "9123456701",
    customerEmail: "rahul.khanna@example.com",
    branchId: "b001",
    categoryId: "cat_01",
    description: "Issue with service agreement delivery."
  })
});

const data = await response.json();
console.log("Ticket created via Integration API:", data.data.ticketNumber);
```

### Example (cURL):
```bash
curl -X POST https://tms.nitinjangra0981.workers.dev/api/v1/integration/complaints \
  -H "x-api-key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Rahul Khanna",
    "customerPhone": "9123456701",
    "customerEmail": "rahul.khanna@example.com",
    "branchId": "b001",
    "categoryId": "cat_01",
    "description": "Issue with corporate billing invoice."
  }'
```

---

## Method 4: Embed Iframe or Direct Link

If you prefer not to write JavaScript:

### Direct Link:
```html
<a 
  href="https://tms.nitinjangra0981.workers.dev/complaint" 
  target="_blank" 
  rel="noopener noreferrer"
  style="display: inline-block; background: #ff6b00; color: #fff; padding: 10px 22px; border-radius: 8px; font-weight: bold; text-decoration: none;"
>
  Register Complaint
</a>
```

### Embeddable Iframe Widget:
```html
<iframe 
  src="https://tms.nitinjangra0981.workers.dev/embed/complaint-button" 
  width="220" 
  height="65" 
  style="border: none; overflow: hidden;" 
  scrolling="no">
</iframe>
```

---

## Dedicated Staff Login URL (Completely Separate)

Staff, branch managers, and system administrators do **not** use the public complaint workflow. They log in via their private workspace URL:

- **Staff Workspace Login URL:** `https://tms.nitinjangra0981.workers.dev/staff-login`
- **Direct Portal Route:** `https://tms.nitinjangra0981.workers.dev/portal`
