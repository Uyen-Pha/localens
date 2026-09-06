import { z } from "zod";

// Avoid Zod's CSP-reporting `new Function` capability probe in the browser.
z.config({ jitless: true });
