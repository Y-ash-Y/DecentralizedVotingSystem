import { expect, test } from "@playwright/test";

for (const width of [375, 1440]) {
  test(`completes a browser-only election at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      Object.defineProperty(window, "ethereum", {
        get() { throw new Error("The sandbox must never access an injected wallet."); },
      });
    });
    await page.goto("/sandbox/");
    const click = name => page.getByRole("button", { name, exact: true }).click();
    const approve = async name => {
      await click(name);
      await click("Approve demo transaction");
    };

    await expect(page.getByRole("heading", { name: "Run a commit–reveal election." })).toBeVisible();
    await page.getByRole("radio", { name: "Demo Voter" }).check();
    await expect(page.getByRole("button", { name: "Create election", exact: true })).toHaveCount(0);
    await page.getByRole("radio", { name: "Demo Admin" }).check();
    await click("Create election");
    await click("Reject");
    await expect(page.getByRole("status")).toHaveText("Demo transaction rejected.");
    await approve("Create election");
    await approve("Register candidates");
    await approve("Enroll demo voter");
    await approve("Seal setup");
    await click("Open voting");
    await page.getByRole("radio", { name: "Demo Voter" }).check();
    await page.getByRole("radio", { name: "Alice" }).check();
    await approve("Commit ballot");
    await expect(page.locator("code")).toHaveText(/^0x[0-9a-f]{64}$/);
    await expect(page.getByText("Alice wins", { exact: false })).toHaveCount(0);
    await click("Open reveal");
    await approve("Reveal ballot");
    await click("Close election");
    await expect(page.getByText("Alice wins · 1 counted ballot")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await click("Reset demo");
    await click("Reset election");
    await expect(page.getByRole("button", { name: "Create election", exact: true })).toBeEnabled();
  });
}
