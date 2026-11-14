# Msquare Professionals — Website Integration & Staff Access Guide

This guide explains how to connect the Complaint Workflow to the main **Msquare Professionals** website, and how staff members access their separate dashboard.

---

## 1. Complaint Workflow on the Msquare Website

There are two easy ways to add the complaint workflow to the main Msquare Professionals website:

### Option A: Header or Navigation Button (Recommended)
Add a button to your main website's navbar or footer that links directly to the client portal:

```html
<!-- Primary Complaint Button for Msquare Website Navbar -->
<a 
  href="https://<your-domain>/complaint" 
  style="display: inline-flex; align-items: center; gap: 8px; background-color: #0a2350; color: #ffffff; padding: 10px 20px; border-radius: 6px; font-weight: 600; text-decoration: none; font-size: 14px;"
>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
  Register Complaint
</a>

<!-- Track Status Link -->
<a 
  href="https://<your-domain>/track" 
  style="color: #2c6bdf; text-decoration: none; font-weight: 500; font-size: 14px; margin-left: 12px;"
>
  Track Existing Ticket →
</a>
```

### Option B: Direct Portal Link
You can also link to the full client resolution center:
- **Client Care Home:** `https://<your-domain>/`
- **Direct Complaint Registration:** `https://<your-domain>/complaint`
- **Direct Ticket Tracking:** `https://<your-domain>/track`

### Option C: Standalone Embed Iframe
Embed the self-contained button widget into any section of your site:
```html
<iframe 
  src="https://<your-domain>/embed/complaint-button" 
  width="240" 
  height="70" 
  frameborder="0" 
  style="border: none; overflow: hidden;"
></iframe>
```

---

## 2. Separate Staff Dashboard Link

Internal staff and administrators do **not** use the public client pages. They have their own dedicated, secure URL:

### **Dedicated Staff URL: `https://<your-domain>/staff-login`**

- **URL:** `/staff-login` (or `/portal`)
- **Authorized Roles:**
  - `ROOT_ADMIN` ➔ Access to Master Admin Panel (`/admin`), System Settings, Audit Logs, API Keys, and Mailbox.
  - `CENTRAL_ADMIN` ➔ Central Operations Oversight.
  - `BRANCH_MANAGER` ➔ Office/Branch Team & Assignment Queue.
  - `SUPPORT_AGENT` ➔ Assigned Ticket Queue and Resolution Workflows.

### Demo Staff Credentials for Testing:
| Role | Email | Password | Landing Page |
|---|---|---|---|
| **Root Admin** | `admin@fitclass.dev` | `Admin@123` | `/admin` (Master Panel) |
| **Central Admin** | `central.admin@fitclass.dev` | `Central@123` | `/staff` (Operations) |
| **Manager (Sector 48)** | `manager.b001@fitclass.dev` | `Manager@123` | `/staff` (Branch Team) |
| **Support Agent (Sector 48)** | `support.b001.a@fitclass.dev` | `Support@123` | `/staff/tickets` |

*(Clients never see these links on the public Msquare website).*
