import { expect, test } from "@playwright/test";

test.describe("Bab Ride navigation and mobile layout", () => {
  test("keeps primary actions reachable without horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your campus. Your ride." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request tricycle" })).toBeVisible();
const hasNoHorizontalOverflow = await page.locator("body").evaluate(
  (body) => body.scrollWidth <= body.clientWidth
);
expect(hasNoHorizontalOverflow).toBe(true);
    await expect(page.getByRole("link", { name: "Become a rider" })).toBeVisible();
  });

  test("opens the rider registration flow", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Become a rider" }).click();
    await expect(page.getByRole("heading", { name: "Join Bab Ride as a Rider" })).toBeVisible();
  });
});
