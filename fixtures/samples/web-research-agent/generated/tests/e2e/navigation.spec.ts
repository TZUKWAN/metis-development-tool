/**
 * Generated navigation interaction test (generator-owned): clicking the
 * navigate interaction's source element lands on the target page.
 */
import { expect, test } from '@playwright/test'

test('navigate interaction: click moves to the target page', async ({ page }) => {
  await page.goto("/")
  await page.locator('[data-mdt-id="01a0a224-e67d-7c83-a02e-e4d8e9a50929"]').click()
  await expect(page.locator('.mdt-page').first()).toBeVisible()
  await expect(page).toHaveURL(new RegExp("/results$"))
})
