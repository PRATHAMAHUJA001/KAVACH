import { setupWorker } from "msw/browser";

/**
 * Starts the mock backend. URL switches (sticky for the tab):
 *   ?role=reviewer|analyst|admin|auditor   who is signed in
 *   ?cold=1                                 simulate a sleeping server (~6 s wake-up)
 */
export async function startMocks() {
  try {
    const params = new URLSearchParams(window.location.search);
    const role = params.get("role");
    if (role) sessionStorage.setItem("kavach.mockRole", role);
    if (params.has("cold")) sessionStorage.setItem("kavach.mockCold", params.get("cold") === "1" ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  const { handlers } = await import("./handlers");
  const worker = setupWorker(...handlers);
  await worker.start({
    onUnhandledRequest: "bypass",
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });
}
