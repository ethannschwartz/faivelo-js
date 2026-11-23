import { addServerHandler, addServerImports, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
import { defu } from 'defu'

export type * from './runtime/server/utils/events'
export type { CapturedEmail } from './runtime/server/utils/preview'

export interface ModuleOptions {
  /**
   * Default sender for sendEmail(), e.g. "Acme <hello@acme.com>". Any address
   * on a domain verified in Faivelo. Runtime override: NUXT_FAIVELO_FROM or FAIVELO_FROM.
   */
  from?: string
  /**
   * With no API key in `nuxi dev`, keep emails in a local outbox at
   * /_faivelo/outbox (and the DevTools tab) instead of failing. Default true.
   */
  devOutbox?: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@faivelo/nuxt',
    configKey: 'faivelo',
    docs: 'https://faivelo.com/docs/developers/nuxt',
    compatibility: { nuxt: '>=3.10.0' }
  },
  defaults: {
    devOutbox: true
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    const logger = useLogger('faivelo')

    // Secrets stay server-only: runtimeConfig.faivelo, never .public.
    // NUXT_FAIVELO_API_KEY / NUXT_FAIVELO_WEBHOOK_SECRET / NUXT_FAIVELO_FROM
    // override at runtime; the plain FAIVELO_* names work too (read in utils).
    nuxt.options.runtimeConfig.faivelo = defu(nuxt.options.runtimeConfig.faivelo as Record<string, unknown> | undefined, {
      apiKey: '',
      webhookSecret: '',
      from: options.from ?? '',
      devOutbox: options.devOutbox !== false
    })

    const utils = resolve('./runtime/server/utils/faivelo')
    addServerImports(['useFaivelo', 'sendEmail', 'defineFaiveloWebhookHandler'].map(name => ({ name, from: utils })))

    if (nuxt.options.dev && options.devOutbox !== false) {
      ;(nuxt.options.runtimeConfig.faivelo as Record<string, unknown>).outboxDir = resolve(nuxt.options.buildDir, 'faivelo-outbox')
      addServerHandler({ route: '/_faivelo/outbox', handler: resolve('./runtime/server/routes/outbox') })
      addServerHandler({ route: '/_faivelo/outbox/**', handler: resolve('./runtime/server/routes/outbox') })

      // Nuxt DevTools tab (Shift+Alt+D), no dependency on @nuxt/devtools-kit.
      ;(nuxt.hook as (name: string, fn: (tabs: unknown[]) => void) => void)('devtools:customTabs', (tabs) => {
        tabs.push({ name: 'faivelo', title: 'Faivelo outbox', icon: 'lucide:mail', view: { type: 'iframe', src: '/_faivelo/outbox' } })
      })

      const hasKey = Boolean(process.env.NUXT_FAIVELO_API_KEY || process.env.FAIVELO_API_KEY || (nuxt.options.runtimeConfig.faivelo as { apiKey?: string }).apiKey)
      if (!hasKey) logger.info('No FAIVELO_API_KEY: sendEmail() keeps emails in the dev outbox at /_faivelo/outbox instead of sending.')
    }
  }
})
