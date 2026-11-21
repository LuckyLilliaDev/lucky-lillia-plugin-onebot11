import type { ActionHost, BaseAction } from '@luckylillia-dev/plugin-nt-protocol/onebot'
import { HandleQuickOperation } from './go-cqhttp/QuickOperation'
import { GetEvent } from './llbot/system/GetEvent'

export function initActionMap(host: ActionHost): Map<string, BaseAction<any, unknown>> {
  const actions = new Map(host.ctx.ntOnebot.actionMap)
  for (const action of [new HandleQuickOperation(host), new GetEvent(host)]) {
    for (const suffix of ['', '_async', '_rate_limited']) actions.set(action.actionName + suffix, action)
  }
  return actions
}
