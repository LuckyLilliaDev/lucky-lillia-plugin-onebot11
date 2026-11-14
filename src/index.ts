import type {} from '@luckylillia/plugin-nt-protocol/contracts'
import type {} from '@luckylillia/plugin-sdk'
import { Context } from 'cordis'
import Onebot11Adapter from './adapter'
import { OB11Schema, validateListeners, type OB11Settings } from './settings'

export const name = '@luckylillia/plugin-onebot11'
export type Config = OB11Settings
export const Config = OB11Schema
export const inject = Onebot11Adapter.inject

export async function apply(ctx: Context, config: Config) {
  validateListeners(config)
  await ctx.plugin(Onebot11Adapter, { ...config, enable: true })
}
