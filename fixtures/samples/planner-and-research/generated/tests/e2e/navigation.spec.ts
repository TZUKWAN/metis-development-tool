/**
 * Generated navigation interaction test (generator-owned): clicking the
 * navigate interaction's source element lands on the target page.
 */
import { expect, test } from '@playwright/test'

test('navigate interaction: click moves to the target page', async ({ page }) => {
  await page.goto("/")
  await page.locator('[data-mdt-id="01a0a224-e6e5-74ad-9dc8-3e06a8348d30"]').click()
  await expect(page.locator('.mdt-page').first()).toBeVisible()
  await expect(page).toHaveURL(new RegExp("/research$"))
})
