/**
 * Generated navigation interaction test (generator-owned): clicking the
 * navigate interaction's source element lands on the target page.
 */
import { expect, test } from '@playwright/test'

test('navigate interaction: click moves to the target page', async ({ page }) => {
  await page.goto("/")
  await page.locator('[data-mdt-id="a0000000-0000-7000-8000-000000000008"]').click()
  await expect(page.locator('.mdt-page').first()).toBeVisible()
  await expect(page).toHaveURL(new RegExp("/results$"))
})
