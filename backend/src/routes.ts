import { Router } from 'express';
import { CreateGameRequest, ExtendMyceliumRequest, ApiResponse, HexCoord } from './types';
import { createNewGame, extendMycelium, undoLastMove, findAutoPath } from './gameLogic';
import { saveGame, loadGame, deleteGame, listGames } from './db';
import { coordKey } from './hexUtils';

const router = Router();

router.post('/games', (req, res) => {
  try {
    const { level = 1, gridRadius } = req.body as CreateGameRequest;
    const game = createNewGame(level, gridRadius);
    saveGame(game);

    const response: ApiResponse<typeof game> = {
      success: true,
      data: game,
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '创建游戏失败',
    };
    res.status(500).json(response);
  }
});

router.get('/games', (req, res) => {
  try {
    const games = listGames();
    const response: ApiResponse<typeof games> = {
      success: true,
      data: games.map((g) => ({
        id: g.id,
        level: g.level,
        status: g.status,
        steps: g.steps,
        optimalSteps: g.optimalSteps,
        updatedAt: g.updatedAt,
      })),
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '获取游戏列表失败',
    };
    res.status(500).json(response);
  }
});

router.get('/games/:id', (req, res) => {
  try {
    const game = loadGame(req.params.id);
    if (!game) {
      const response: ApiResponse = { success: false, error: '游戏不存在' };
      return res.status(404).json(response);
    }
    const response: ApiResponse<typeof game> = { success: true, data: game };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '加载游戏失败',
    };
    res.status(500).json(response);
  }
});

router.post('/games/:id/extend', (req, res) => {
  try {
    const { coord } = req.body as ExtendMyceliumRequest;
    if (!coord || typeof coord.q !== 'number' || typeof coord.r !== 'number') {
      const response: ApiResponse = { success: false, error: '坐标参数无效' };
      return res.status(400).json(response);
    }

    const game = loadGame(req.params.id);
    if (!game) {
      const response: ApiResponse = { success: false, error: '游戏不存在' };
      return res.status(404).json(response);
    }

    const result = extendMycelium(game, coord);
    saveGame(result.game);

    const response: ApiResponse = {
      success: result.success,
      data: result.game,
      error: result.success ? undefined : result.message,
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '延伸菌丝失败',
    };
    res.status(500).json(response);
  }
});

router.post('/games/:id/undo', (req, res) => {
  try {
    const game = loadGame(req.params.id);
    if (!game) {
      const response: ApiResponse = { success: false, error: '游戏不存在' };
      return res.status(404).json(response);
    }

    const result = undoLastMove(game);
    saveGame(result.game);

    const response: ApiResponse = {
      success: result.success,
      data: result.game,
      error: result.success ? undefined : result.message,
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '撤销操作失败',
    };
    res.status(500).json(response);
  }
});

router.post('/games/:id/reset', (req, res) => {
  try {
    const game = loadGame(req.params.id);
    if (!game) {
      const response: ApiResponse = { success: false, error: '游戏不存在' };
      return res.status(404).json(response);
    }

    const newGame = createNewGame(game.level, game.gridRadius);
    saveGame({ ...newGame, id: game.id, createdAt: game.createdAt });

    const response: ApiResponse = { success: true, data: { ...newGame, id: game.id } };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '重置游戏失败',
    };
    res.status(500).json(response);
  }
});

router.delete('/games/:id', (req, res) => {
  try {
    const deleted = deleteGame(req.params.id);
    const response: ApiResponse = {
      success: deleted,
      error: deleted ? undefined : '游戏不存在',
    };
    res.status(deleted ? 200 : 404).json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '删除游戏失败',
    };
    res.status(500).json(response);
  }
});

router.post('/games/:id/find-path', (req, res) => {
  try {
    const { from, to } = req.body as { from: HexCoord; to: HexCoord };
    if (!from || !to) {
      const response: ApiResponse = { success: false, error: '起点和终点都需要' };
      return res.status(400).json(response);
    }

    const game = loadGame(req.params.id);
    if (!game) {
      const response: ApiResponse = { success: false, error: '游戏不存在' };
      return res.status(404).json(response);
    }

    const path = findAutoPath(game, from, to);
    const response: ApiResponse = {
      success: path !== null,
      data: path || undefined,
      error: path === null ? '找不到可行路径' : undefined,
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '寻路失败',
    };
    res.status(500).json(response);
  }
});

export default router;
