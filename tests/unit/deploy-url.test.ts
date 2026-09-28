import { describe, expect, it } from 'vitest'
import { deploymentUrl } from '../../scripts/deploy-url.mjs'

describe('deploymentUrl', () => {
  it('prefers an explicit APP_URL', () => {
    expect(deploymentUrl({ APP_URL: ' https://x.example ', URL: 'https://y.example' })).toBe(
      'https://x.example',
    )
  })

  it('uses the canonical www origin when Netlify serves the production domain', () => {
    for (const URL of ['http://hournook.com', 'https://hournook.com', 'https://www.hournook.com']) {
      expect(deploymentUrl({ CONTEXT: 'production', URL })).toBe('https://www.hournook.com')
    }
  })

  it('keeps Netlify URLs for other sites and non-production contexts', () => {
    expect(deploymentUrl({ CONTEXT: 'production', URL: 'https://site.netlify.app' })).toBe(
      'https://site.netlify.app',
    )
    expect(
      deploymentUrl({
        CONTEXT: 'deploy-preview',
        URL: 'https://www.hournook.com',
        DEPLOY_PRIME_URL: 'https://deploy-preview-4--site.netlify.app',
      }),
    ).toBe('https://deploy-preview-4--site.netlify.app')
    expect(deploymentUrl({})).toBeUndefined()
  })
})
