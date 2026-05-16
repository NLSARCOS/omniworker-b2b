---
name: browser-automation
description: Guidelines for OmniWorker browser navigation, specifically choosing between visual (screenshot) and text-DOM interaction modes.
---

# Browser Automation: Visual vs Text-DOM

OmniWorker has two primary modes of interacting with web pages via the `browser` toolset. It is **CRITICAL** that you choose the right tool family for the job to ensure high performance and low token consumption.

## 1. Text-DOM Tools (Preferred)
**Tools:** `browser_dom_navigate`, `browser_dom_read`, `browser_dom_click`, `browser_dom_type`, `browser_dom_select`, `browser_dom_scroll`

The Text-DOM tools extract a highly token-efficient, simplified version of the webpage, injecting numerical indices into interactive elements (e.g., `[3]<button>Submit</button>`). 

**When to use Text-DOM:**
- ✅ Form filling, data entry, CRM, and ERP interactions
- ✅ Extracting text or reading standard structured pages
- ✅ Performing multi-step flows where latency and token efficiency are critical
- ✅ Any page built with standard HTML inputs, buttons, and selects

**How to use:**
1. Call `browser_dom_navigate(url)` OR `browser_dom_read()` to get the page state.
2. Read the returned numbered elements.
3. Use the explicit index to act: `browser_dom_click(index=3)` or `browser_dom_type(index=5, text="my@email.com")`.

## 2. Visual / Screenshot Tools (Fallback)
**Tools:** `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_vision`

These tools use coordinate-based clicking and OCR/vision models to interact with the raw visual representation of the page.

**When to use Visual tools:**
- 🖼️ Canvas elements, WebGL, or complex custom UI components that don't map to DOM elements
- 🛡️ Captcha solving
- 📊 Analyzing charts, graphs, or image-heavy layouts where the visual positioning matters
- ❌ When Text-DOM tools fail to extract the element you need

**Summary:** 
**Always default to `browser_dom_*` tools** for reading and interacting with the web. Fall back to standard `browser_*` tools ONLY when visual understanding is strictly necessary.
