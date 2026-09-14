/**
 * Generated chat interaction test (generator-owned): the SSE endpoint is
 * mocked via Playwright route interception — no agent service, no LLM.
 */
import { expect, test } from '@playwright/test'

test('chat send streams the mocked agent response', async ({ page }) => {
  await page.route('**/api/agent/**', async (route) => {
    if (route.request().url().includes('/cancel')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
      return
    }
    const events = [
      { type: 'run_start', runId: 'run-test' },
      { type: 'text_delta', delta: 'Mocked ' },
      { type: 'text_delta', delta: 'answer' },
      { type: 'run_end', stopReason: 'completed', responseText: 'Mocked answer' },
    ]
    const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
  })
  await page.goto("/")
  const chatBox = page.locator('[data-mdt-id="01a0a224-e6e5-74ae-9d7e-d4951635d01d"]')
  await chatBox.locator('input[type="text"]').fill('Hello agent')
  await chatBox.getByRole('button', { name: 'Send' }).click()
  await expect(chatBox.locator('.mdt-chat-assistant').filter({ hasText: 'Mocked answer' })).toBeVisible()
})
