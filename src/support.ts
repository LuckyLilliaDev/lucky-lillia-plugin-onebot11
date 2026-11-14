import type { Context } from 'cordis'

interface HostConfig { readonly version: string }
export const hostVersion = (ctx: Context) => (ctx.get('config') as HostConfig)?.version ?? 'unknown'

// Events have prototype methods, so preserve the prototype while changing per-connection fields.
export const cloneObj = <T>(obj: T): T => Object.assign(Object.create(Object.getPrototypeOf(obj)), obj)
