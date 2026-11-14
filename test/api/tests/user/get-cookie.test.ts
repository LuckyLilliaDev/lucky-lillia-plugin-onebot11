import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@luckylillia/plugin-nt-protocol/onebot';

describe('get_cookie - 获取 Cookie', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取 Cookie', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetCookies, {
      domain: 'qun.qq.com'
    });

    Assertions.assertSuccess(response, 'get_cookie');
    Assertions.assertResponseHasFields(response, ['cookies']);
  }, 30000);
});
