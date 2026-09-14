/**
 * Generated route smoke test (generator-owned): every MDT page route renders
 * its page container. No agent service needed — pure frontend rendering.
 */
import { expect, test } from '@playwright/test'

import { pageRoutes } from '../../src/routes'

test.describe('route smoke', () => {
  for (const route of pageRoutes) {
    test(`page ${route.path} renders`, async ({ page }) => {
      await page.goto(route.path)
      await expect(page.locator('.mdt-page').first()).toBeVisible()
      const pageId = await page.locator('.mdt-page').first().getAttribute('data-mdt-id')
      expect(pageId).toBe(route.pageId)
    })
  }
})
