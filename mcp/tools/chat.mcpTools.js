const chatController = require('../../controllers/chat.controller');

/**
 * We dispatch MCP tool calls to the existing chat controller logic.
 *
 * Note: chat.controller exports sendMessage/getHistory/clearHistory as Express handlers.
 * For MCP, we call their underlying behavior by reusing the controllers' exported
 * functions through a small adapter.
 */

function adaptExpressHandler(handler, { method = 'POST' } = {}) {
  return async ({ args, req }) => {
    // req.user is injected by auth middleware mounted on /api
    // so we pass it through verbatim to the controller handler.
    const fakeReq = {
      body: args || {},
      user: req?.user,
      params: {},
      query: {},
      headers: req?.headers,
      method,
      path: req?.path,
      get: (h) => req?.headers?.[h.toLowerCase()],
    };

    let statusCode = 200;
    let jsonPayload;

    const fakeRes = {
      status: (code) => {
        statusCode = code;
        return fakeRes;
      },
      json: (payload) => {
        jsonPayload = payload;
        return payload;
      }
    };

    await handler(fakeReq, fakeRes);

    // Normalize to a predictable MCP-like result
    return {
      statusCode,
      ...(jsonPayload && typeof jsonPayload === 'object' ? jsonPayload : { result: jsonPayload })
    };
  };
}

const tools = {
  'chat.sendMessage': adaptExpressHandler(chatController.sendMessage, { method: 'POST' }),
  'chat.getHistory': adaptExpressHandler(chatController.getHistory, { method: 'GET' }),
  'chat.clearHistory': adaptExpressHandler(chatController.clearHistory, { method: 'DELETE' }),
};


module.exports = { tools };

