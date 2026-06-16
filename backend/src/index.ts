import express from 'express';
import cors from 'cors';
import routes from './routes';

const app = express();
const PORT = process.env.PORT || 42037;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '真菌网络游戏后端服务正常' });
});

app.use('/api', routes);

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  🍄 真菌网络游戏后端启动成功`);
  console.log(`  🌐 服务地址: http://localhost:${PORT}`);
  console.log(`  📡 API路径: http://localhost:${PORT}/api`);
  console.log(`========================================\n`);
});
