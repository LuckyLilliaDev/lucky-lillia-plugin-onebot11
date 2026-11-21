import { BaseAction, Schema } from '@luckylillia-dev/plugin-nt-protocol/onebot'
import { handleQuickOperation, QuickOperation, QuickOperationEvent } from '../../helper/quickOperation'
import { ActionName } from '@luckylillia-dev/plugin-nt-protocol/onebot'

interface Payload {
  context: QuickOperationEvent,
  operation: QuickOperation
}

export class HandleQuickOperation extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_HandleQuickOperation
  payloadSchema = Schema.object({
    context: Schema.any().required(),
    operation: Schema.any().required(),
  })

  protected async _handle(payload: Payload) {
    handleQuickOperation(this.ctx, payload.context, payload.operation).catch(e => this.ctx.logger.error(e))
    return null
  }
}
