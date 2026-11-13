import { expect, test } from "@playwright/test";

function localInputTime(seconds) {
  const date = new Date(seconds * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

for (const width of [375, 1440]) {
  test(`the real VoteChain app counts a revealed ballot at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      Object.defineProperty(window, "ethereum", {
        get() { throw new Error("The sandbox must not use an injected wallet"); },
      });
    });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/sandbox/");
    const click = name => page.getByRole("button", { name, exact: true }).click();
    const advance = async () => { await click("Advance 1 minute"); await click("Advance 1 minute"); };
    await click("Enter as Demo Admin");
    const voter = (await page.getByText(/^Voter address:/).innerText()).replace("Voter address: ", "");
    await expect(page.locator("time")).toBeVisible();
    const chainTime = await page.locator("time").getAttribute("datetime");
    const start = Math.floor(Date.parse(chainTime) / 60_000) * 60 + 120;
    await page.getByLabel("Election name").fill("Campus council");
    await page.getByLabel(/Commit-reveal —/).check();
    await page.getByLabel("Voting starts (local time)").fill(localInputTime(start));
    await page.getByLabel("Commit closes (local time)").fill(localInputTime(start + 120));
    await page.getByLabel("Reveal closes (local time)").fill(localInputTime(start + 240));
    await click("Create Commit-Reveal Election");
    await page.getByText("Campus council", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Campus council" })).toBeVisible();
    await page.getByLabel("Candidate names").fill("Alice\nBob");
    await click("Add Candidates");
    await expect(page.getByText("Candidates (2)", { exact: true })).toBeVisible();
    await page.getByLabel("Voter wallet addresses").fill(voter);
    await click("Authorize Voter");
    await expect(page.getByText("Authorized Voters (1)", { exact: true })).toBeVisible();
    await click("Seal Setup");
    await expect(page.getByText(/Setup sealed; candidates/)).toBeVisible();
    await click("Demo Voter");
    await click("Enter as Demo Voter");
    await page.getByText("Campus council", { exact: true }).click();
    await expect(page.getByText(/This wallet is on the authorized voter list/)).toBeVisible();
    await advance();
    await expect(page.getByText("Commit Your Vote (Delayed Disclosure)", { exact: true })).toBeVisible();
    await page.getByRole("row", { name: /Alice/ }).getByRole("button", { name: "Select" }).click();
    await page.getByRole("button", { name: /Commit Vote/ }).click();
    await expect(page.getByText(/Your vote commitment is on-chain/)).toBeVisible();
    await advance();
    await click("Load saved");
    await page.getByRole("button", { name: /Reveal Vote/ }).click();
    await expect(page.getByText(/Your vote has been revealed and counted/)).toBeVisible();
    await advance();
    await expect(page.getByText("Highest tally: Alice (1 votes).", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
