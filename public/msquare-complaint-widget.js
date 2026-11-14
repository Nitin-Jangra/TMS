/**
 * MSquare Professionals - Embeddable Complaint & Resolution Widget
 * 
 * Simply add to any page on https://msquareprofessionals.com:
 * <script src="https://tms.nitinjangra0981.workers.dev/msquare-complaint-widget.js" async></script>
 * 
 * To attach to an existing button: <button data-msquare-complaint>Complaint</button>
 * Or let it render a floating button automatically by default.
 */
(function () {
  if (window.__MSQUARE_COMPLAINT_WIDGET_LOADED__) return;
  window.__MSQUARE_COMPLAINT_WIDGET_LOADED__ = true;

  const API_BASE = "https://tms.nitinjangra0981.workers.dev/api/v1/public";

  // Inject CSS Styles
  const style = document.createElement("style");
  style.id = "msquare-widget-styles";
  style.textContent = `
    .msq-modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(6px);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      box-sizing: border-box;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease-in-out;
    }
    .msq-modal-overlay.msq-open {
      opacity: 1;
      pointer-events: auto;
    }
    .msq-modal-card {
      background: #13131a;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      width: 100%;
      max-width: 520px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 107, 0, 0.15);
      color: #f4f4f7;
      padding: 24px;
      position: relative;
      transform: translateY(20px);
      transition: transform 0.2s ease-out;
      box-sizing: border-box;
    }
    .msq-modal-overlay.msq-open .msq-modal-card {
      transform: translateY(0);
    }
    .msq-close-btn {
      position: absolute;
      top: 18px;
      right: 18px;
      background: transparent;
      border: none;
      color: #a1a1aa;
      font-size: 22px;
      cursor: pointer;
      line-height: 1;
      padding: 4px;
      transition: color 0.15s;
    }
    .msq-close-btn:hover { color: #ffffff; }
    .msq-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 12px;
    }
    .msq-tab-btn {
      background: transparent;
      border: none;
      color: #a1a1aa;
      font-size: 13px;
      font-weight: 700;
      padding: 8px 14px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .msq-tab-btn.active {
      background: rgba(255, 107, 0, 0.12);
      color: #ff6b00;
      border: 1px solid rgba(255, 107, 0, 0.3);
    }
    .msq-field {
      margin-bottom: 14px;
      text-align: left;
    }
    .msq-label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #a1a1aa;
      margin-bottom: 6px;
    }
    .msq-input, .msq-select, .msq-textarea {
      width: 100%;
      background: #171722;
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #ffffff;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 13px;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .msq-input:focus, .msq-select:focus, .msq-textarea:focus {
      border-color: #ff6b00;
      box-shadow: 0 0 0 2px rgba(255, 107, 0, 0.2);
    }
    .msq-btn-primary {
      width: 100%;
      background: linear-gradient(135deg, #ff6b00 0%, #ff8533 100%);
      color: #ffffff;
      border: none;
      border-radius: 10px;
      padding: 12px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(255, 107, 0, 0.4);
      transition: brightness 0.15s, transform 0.1s;
      margin-top: 6px;
    }
    .msq-btn-primary:hover {
      filter: brightness(1.1);
    }
    .msq-btn-primary:active {
      transform: scale(0.99);
    }
    .msq-btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .msq-floating-trigger {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: linear-gradient(135deg, #ff6b00 0%, #ff8533 100%);
      color: #ffffff;
      border: none;
      border-radius: 30px;
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 6px 20px rgba(255, 107, 0, 0.5);
      z-index: 999990;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: transform 0.15s, box-shadow 0.15s;
      font-family: inherit;
    }
    .msq-floating-trigger:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(255, 107, 0, 0.65);
    }
    .msq-ticket-badge {
      background: #171722;
      border: 1px solid rgba(255, 107, 0, 0.35);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      margin: 16px 0;
    }
    .msq-ticket-num {
      font-size: 26px;
      font-family: monospace;
      font-weight: 800;
      color: #ff6b00;
      letter-spacing: 1px;
      margin: 8px 0;
    }
    .msq-status-pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      background: rgba(255, 107, 0, 0.15);
      color: #ff6b00;
      border: 1px solid rgba(255, 107, 0, 0.3);
    }
  `;
  document.head.appendChild(style);

  // Create Modal DOM
  const modal = document.createElement("div");
  modal.className = "msq-modal-overlay";
  modal.innerHTML = `
    <div class="msq-modal-card">
      <button class="msq-close-btn" aria-label="Close modal">&times;</button>
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
        <div style="background: linear-gradient(135deg, #ff6b00, #ea580c); width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900; color: #fff; font-size: 16px;">M</div>
        <div>
          <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #ffffff;">MSQUARE PROFESSIONALS</h3>
          <p style="margin: 2px 0 0; font-size: 11px; font-weight: 700; color: #ff6b00; letter-spacing: 0.5px;">CLIENT CARE & RESOLUTION</p>
        </div>
      </div>

      <div class="msq-tabs">
        <button type="button" class="msq-tab-btn active" data-tab="register">Register Complaint</button>
        <button type="button" class="msq-tab-btn" data-tab="track">Track Ticket</button>
      </div>

      <!-- Register Form Tab -->
      <div id="msq-tab-register">
        <form id="msq-register-form">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="msq-field">
              <label class="msq-label">Full Name *</label>
              <input type="text" name="customerName" class="msq-input" placeholder="Rahul Khanna" required />
            </div>
            <div class="msq-field">
              <label class="msq-label">Mobile Number *</label>
              <input type="tel" name="customerPhone" class="msq-input" placeholder="10-digit number" required />
            </div>
          </div>
          <div class="msq-field">
            <label class="msq-label">Email Address *</label>
            <input type="email" name="customerEmail" class="msq-input" placeholder="you@example.com" required />
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="msq-field">
              <label class="msq-label">Branch / Office *</label>
              <select name="branchId" class="msq-select" required>
                <option value="">Loading offices...</option>
              </select>
            </div>
            <div class="msq-field">
              <label class="msq-label">Category *</label>
              <select name="categoryId" class="msq-select" required>
                <option value="">Loading categories...</option>
              </select>
            </div>
          </div>
          <div class="msq-field">
            <label class="msq-label">Complaint Details *</label>
            <textarea name="description" rows="4" class="msq-textarea" placeholder="Please describe what happened (minimum 10 characters)..." required></textarea>
          </div>
          <div style="margin: 12px 0 16px; font-size: 11px; color: #a1a1aa; line-height: 1.5; text-align: left;">
            <label style="display: flex; gap: 8px; cursor: pointer; align-items: flex-start;">
              <input type="checkbox" name="privacyConsent" required style="accent-color: #ff6b00; margin-top: 2px;" />
              <span>I consent to MSquare Professionals processing these details to resolve my request and dispatching status updates to my email.</span>
            </label>
          </div>
          <div id="msq-register-error" style="color: #ef4444; font-size: 12px; margin-bottom: 10px; display: none;"></div>
          <button type="submit" class="msq-btn-primary" id="msq-submit-btn">Submit Complaint</button>
        </form>
        <div id="msq-register-success" style="display: none; text-align: center;">
          <div style="background: rgba(16, 185, 129, 0.15); width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; color: #10b981; font-size: 24px;">✓</div>
          <h4 style="margin: 0; font-size: 18px; font-weight: 800; color: #ffffff;">Complaint Registered</h4>
          <p style="margin: 6px 0 14px; font-size: 12px; color: #a1a1aa;">An acknowledgement email with greeting has been sent to your inbox.</p>
          <div class="msq-ticket-badge">
            <span style="font-size: 11px; text-transform: uppercase; color: #a1a1aa; font-weight: 700;">Your Ticket Reference Number</span>
            <div class="msq-ticket-num" id="msq-res-ticket">MSP-2026-000000</div>
            <button type="button" id="msq-copy-btn" style="background: #13131a; border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 6px 14px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer;">Copy Ticket Number</button>
          </div>
          <button type="button" class="msq-btn-primary" id="msq-done-btn">Done</button>
        </div>
      </div>

      <!-- Track Tab -->
      <div id="msq-tab-track" style="display: none;">
        <form id="msq-track-form">
          <div class="msq-field">
            <label class="msq-label">Ticket Reference Number *</label>
            <input type="text" name="ticketNumber" class="msq-input" placeholder="MSP-2026-000123" required />
          </div>
          <div class="msq-field">
            <label class="msq-label">Registered Mobile Number *</label>
            <input type="tel" name="mobileNumber" class="msq-input" placeholder="10-digit number" required />
          </div>
          <div id="msq-track-error" style="color: #ef4444; font-size: 12px; margin-bottom: 10px; display: none;"></div>
          <button type="submit" class="msq-btn-primary" id="msq-track-btn">Track Request</button>
        </form>
        <div id="msq-track-result" style="display: none; margin-top: 16px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Setup Elements
  const closeBtn = modal.querySelector(".msq-close-btn");
  const tabBtns = modal.querySelectorAll(".msq-tab-btn");
  const tabRegister = modal.querySelector("#msq-tab-register");
  const tabTrack = modal.querySelector("#msq-tab-track");
  const branchSelect = modal.querySelector("select[name='branchId']");
  const categorySelect = modal.querySelector("select[name='categoryId']");
  const registerForm = modal.querySelector("#msq-register-form");
  const registerSuccess = modal.querySelector("#msq-register-success");
  const registerError = modal.querySelector("#msq-register-error");
  const submitBtn = modal.querySelector("#msq-submit-btn");
  const resTicket = modal.querySelector("#msq-res-ticket");
  const copyBtn = modal.querySelector("#msq-copy-btn");
  const doneBtn = modal.querySelector("#msq-done-btn");
  const trackForm = modal.querySelector("#msq-track-form");
  const trackBtn = modal.querySelector("#msq-track-btn");
  const trackError = modal.querySelector("#msq-track-error");
  const trackResult = modal.querySelector("#msq-track-result");

  function openModal(defaultTab) {
    if (defaultTab) switchTab(defaultTab);
    modal.classList.add("msq-open");
    loadDropdowns();
  }

  function closeModal() {
    modal.classList.remove("msq-open");
  }

  function switchTab(name) {
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    tabRegister.style.display = name === "register" ? "block" : "none";
    tabTrack.style.display = name === "track" ? "block" : "none";
  }

  closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  tabBtns.forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  doneBtn.addEventListener("click", () => {
    registerForm.reset();
    registerForm.style.display = "block";
    registerSuccess.style.display = "none";
    closeModal();
  });

  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(resTicket.textContent);
    copyBtn.textContent = "Copied!";
    setTimeout(() => { copyBtn.textContent = "Copy Ticket Number"; }, 2000);
  });

  // Fetch branches and categories
  let dropdownsLoaded = false;
  async function loadDropdowns() {
    if (dropdownsLoaded) return;
    try {
      const [brRes, catRes] = await Promise.all([
        fetch(`${API_BASE}/branches`).then((r) => r.json()),
        fetch(`${API_BASE}/categories`).then((r) => r.json()),
      ]);

      if (brRes.success && brRes.data?.branches) {
        branchSelect.innerHTML = brRes.data.branches
          .map((b) => `<option value="${b.id}">${b.name} ${b.city ? `(${b.city})` : ""}</option>`)
          .join("");
      }

      if (catRes.success && catRes.data?.categories) {
        categorySelect.innerHTML = catRes.data.categories
          .map((c) => `<option value="${c.id}">${c.name}</option>`)
          .join("");
      }
      dropdownsLoaded = true;
    } catch {
      branchSelect.innerHTML = `<option value="">Default Branch</option>`;
      categorySelect.innerHTML = `<option value="">General Support</option>`;
    }
  }

  // Handle Complaint Submission
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    registerError.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Registering...";

    const fd = new FormData(registerForm);
    const payload = {
      customerName: fd.get("customerName"),
      customerPhone: fd.get("customerPhone"),
      customerEmail: fd.get("customerEmail"),
      branchId: fd.get("branchId"),
      categoryId: fd.get("categoryId"),
      description: fd.get("description"),
      privacyConsent: fd.get("privacyConsent") === "on",
    };

    try {
      const res = await fetch(`${API_BASE}/complaints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        registerError.textContent = data.error?.message || "Failed to submit complaint. Please check your inputs.";
        registerError.style.display = "block";
        return;
      }

      resTicket.textContent = data.data.ticketNumber;
      registerForm.style.display = "none";
      registerSuccess.style.display = "block";
    } catch {
      registerError.textContent = "Network error. Please try again later.";
      registerError.style.display = "block";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Complaint";
    }
  });

  // Handle Ticket Tracking
  trackForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    trackError.style.display = "none";
    trackResult.style.display = "none";
    trackBtn.disabled = true;
    trackBtn.textContent = "Checking...";

    const fd = new FormData(trackForm);
    const payload = {
      ticketNumber: fd.get("ticketNumber"),
      mobileNumber: fd.get("mobileNumber"),
    };

    try {
      const res = await fetch(`${API_BASE}/tickets/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        trackError.textContent = data.error?.message || "Ticket not found or mobile mismatch.";
        trackError.style.display = "block";
        return;
      }

      const t = data.data.ticket;
      trackResult.innerHTML = `
        <div style="background: #171722; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-family: monospace; font-size: 15px; font-weight: 800; color: #ffffff;">${t.ticketNumber}</span>
            <span class="msq-status-pill">${t.statusLabel}</span>
          </div>
          <p style="font-size: 12px; color: #a1a1aa; margin: 4px 0;">Office: <strong style="color: #fff;">${t.branchName}</strong> · Category: <strong style="color: #fff;">${t.categoryName}</strong></p>
          ${t.assigneeFirstName ? `<p style="font-size: 12px; color: #a1a1aa; margin: 4px 0;">Assigned Manager: <strong style="color: #ff6b00;">${t.assigneeFirstName}</strong></p>` : ""}
          ${t.resolution ? `
            <div style="background: rgba(16, 185, 129, 0.1); border-left: 3px solid #10b981; padding: 10px; margin-top: 10px; border-radius: 4px; font-size: 12px; color: #e2e8f0;">
              <strong>Resolution:</strong> ${t.resolution.message}
            </div>` : ""}
        </div>
      `;
      trackResult.style.display = "block";
    } catch {
      trackError.textContent = "Network error. Please try again.";
      trackError.style.display = "block";
    } finally {
      trackBtn.disabled = false;
      trackBtn.textContent = "Track Request";
    }
  });

  // Attach to existing elements with [data-msquare-complaint]
  document.querySelectorAll("[data-msquare-complaint]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openModal("register");
    });
  });

  // Attach to existing elements with [data-msquare-track]
  document.querySelectorAll("[data-msquare-track]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openModal("track");
    });
  });

  // Optional: create floating trigger button if user specifies data-floating="true" or when no button exists
  const hasTrigger = document.querySelector("[data-msquare-complaint]");
  if (!hasTrigger) {
    const floatBtn = document.createElement("button");
    floatBtn.className = "msq-floating-trigger";
    floatBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      Complaint
    `;
    floatBtn.addEventListener("click", () => openModal("register"));
    document.body.appendChild(floatBtn);
  }

  // Expose global controller
  window.MSquareComplaint = {
    open: openModal,
    close: closeModal,
  };
})();
