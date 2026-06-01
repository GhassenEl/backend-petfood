const express = require('express');

/**
 * Minimal MCP-HTTP bridge.
 *
 * This is NOT a full reference implementation of every MCP spec detail.
 * It provides an HTTP endpoint that accepts tool invocation requests
 * and dispatches to registered handlers.
 */

function createMcpRouter({
  tools = {},
  getTool = (name) => tools[name],
} = {}) {
  const router = express.Router();
  router.use(express.json());

  // Health / discovery
  router.get('/mcp', (req, res) => {
    res.json({
      protocol: 'mcp-http-bridge',
      status: 'ok',
      tools: Object.keys(tools),
    });
  });

  /**
   * Invoke a tool.
   *
   * Expected body:
   * {
   *   "tool": "chat.sendMessage",
   *   "args": { ... }
   * }
   */
  router.post('/mcp/invoke', async (req, res) => {
    try {
      const { tool, args } = req.body || {};
      if (!tool) return res.status(400).json({ error: 'tool is required' });

      const handler = getTool(tool);
      if (!handler) return res.status(404).json({ error: `Unknown tool: ${tool}` });

      const result = await handler({ args, req, res });
      return res.json({ tool, result });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'MCP invoke error' });
    }
  });

  return router;
}

module.exports = { createMcpRouter };

