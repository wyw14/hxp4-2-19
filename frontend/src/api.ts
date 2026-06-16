import axios from 'axios';
import { GameState, HexCoord, ApiResponse } from './types';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 5000,
});

export async function createGame(level: number = 1, gridRadius?: number): Promise<GameState> {
  const response = await api.post<ApiResponse<GameState>>('/games', { level, gridRadius });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || '创建游戏失败');
  }
  return response.data.data;
}

export async function getGame(id: string): Promise<GameState> {
  const response = await api.get<ApiResponse<GameState>>(`/games/${id}`);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || '加载游戏失败');
  }
  return response.data.data;
}

export async function extendMycelium(id: string, coord: HexCoord): Promise<GameState> {
  const response = await api.post<ApiResponse<GameState>>(`/games/${id}/extend`, { coord });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || '延伸菌丝失败');
  }
  return response.data.data;
}

export async function undoMove(id: string): Promise<GameState> {
  const response = await api.post<ApiResponse<GameState>>(`/games/${id}/undo`);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || '撤销失败');
  }
  return response.data.data;
}

export async function resetGame(id: string): Promise<GameState> {
  const response = await api.post<ApiResponse<GameState>>(`/games/${id}/reset`);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || '重置失败');
  }
  return response.data.data;
}

export async function findPath(id: string, from: HexCoord, to: HexCoord): Promise<HexCoord[] | null> {
  try {
    const response = await api.post<ApiResponse<HexCoord[]>>(`/games/${id}/find-path`, { from, to });
    if (!response.data.success) return null;
    return response.data.data || null;
  } catch {
    return null;
  }
}
