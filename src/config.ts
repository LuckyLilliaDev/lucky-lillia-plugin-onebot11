export interface BaseConnectConfig {
  type: string
  name?: string
  enable: boolean
  token: string
  reportSelfMessage: boolean
  reportOfflineMessage: boolean
  messageFormat: 'array' | 'string'
  debug: boolean
  filter?: Record<string, unknown>
}

export interface WsConnectConfig extends BaseConnectConfig {
  type: 'ws'
  host: string
  port: number
  heartInterval: number // ms
}

export interface WsReverseConnectConfig extends BaseConnectConfig {
  type: 'ws-reverse'
  url: string
  heartInterval: number // ms
}

export interface HttpConnectConfig extends BaseConnectConfig {
  type: 'http'
  host: string
  port: number
}

export interface HttpPostConnectConfig extends BaseConnectConfig {
  type: 'http-post'
  url: string
  enableHeart: boolean
  heartInterval: number // ms
}

export interface OB11Config {
  enable: boolean
  connect: (WsConnectConfig | WsReverseConnectConfig | HttpConnectConfig | HttpPostConnectConfig)[]
  // /** @deprecated */
  // token?: string
  // /** @deprecated */
  // httpPort?: number
  // /** @deprecated */
  // httpPostUrls?: string[]
  // /** @deprecated */
  // httpSecret?: string
  // /** @deprecated */
  // wsPort?: number
  // /** @deprecated */
  // wsReverseUrls?: string[]
  // /** @deprecated */
  // enableHttp?: boolean
  // /** @deprecated */
  // enableHttpPost?: boolean
  // /** @deprecated */
  // enableWs?: boolean
  // /** @deprecated */
  // enableWsReverse?: boolean
  // /** @deprecated */
  // messagePostFormat?: 'array' | 'string'
  // /** @deprecated */
  // enableHttpHeart?: boolean
  // /**
  //  * 快速操作回复自动引用原消息
  //  * @deprecated
  //  */
  // enableQOAutoQuote?: boolean
  // /** @deprecated */
  // reportSelfMessage?: boolean
}


export interface Config { msgCacheExpire: number; musicCardSignUrl: string; ffmpeg: string }
