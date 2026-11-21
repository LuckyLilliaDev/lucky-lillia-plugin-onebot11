import { BaseAction, Schema } from '@luckylillia-dev/plugin-nt-protocol/onebot'
import { ActionName } from '@luckylillia-dev/plugin-nt-protocol/onebot'
import { getHttpEvent } from '../../../helper/eventForHttp'
import { OB11Message } from '@luckylillia-dev/plugin-nt-protocol/onebot'
import { OB11BaseEvent } from '@luckylillia-dev/plugin-nt-protocol/onebot'

type PostEventType = OB11BaseEvent | OB11Message

interface Payload {
  key: string
  timeout: number | string
}

export class GetEvent extends BaseAction<Payload, PostEventType[]> {
  actionName = ActionName.GetEvent
  payloadSchema = Schema.object({
    key: Schema.string(),
    timeout: Schema.union([Number, String])
  })

  protected async _handle(payload: Payload): Promise<PostEventType[]> {
    let key = ''
    if (payload.key) {
      key = payload.key
    }
    const timeout = +payload.timeout?.toString() || 0
    const evts = await getHttpEvent(key, timeout)
    return evts
  }
}
